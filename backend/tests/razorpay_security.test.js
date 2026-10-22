import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyRazorpaySignature } from "../payments/razorpay-signature.js";
import { RazorpayProvider } from "../payments/RazorpayProvider.js";

const sign = (orderId, paymentId) =>
  crypto.createHmac("sha256", "unit-test-secret").update(`${orderId}|${paymentId}`).digest("hex");

test("rejects simulated signatures and accepts valid HMAC signatures in production", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const input = { keyId: "rzp_test_securitycheck", keySecret: "unit-test-secret", orderId: "order_123", paymentId: "pay_123", production: true };
    assert.equal(verifyRazorpaySignature({ ...input, signature: "signature_simulated" }), false);
    assert.equal(verifyRazorpaySignature({ ...input, signature: sign(input.orderId, input.paymentId) }), true);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("rejects malformed gateway IDs and invalid signatures", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const input = { keyId: "rzp_test_securitycheck", keySecret: "unit-test-secret", orderId: "order_mock123", paymentId: "pay_123", production: true };
    assert.equal(verifyRazorpaySignature({ ...input, signature: sign(input.orderId, input.paymentId) }), false);
    assert.equal(verifyRazorpaySignature({ ...input, orderId: "order_123", signature: "00" }), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("rejects placeholder credentials", () => {
  assert.equal(verifyRazorpaySignature({
    keyId: "rzp_test_placeholder",
    keySecret: "placeholdersecret",
    orderId: "order_123",
    paymentId: "pay_123",
    signature: sign("order_123", "pay_123"),
    production: false,
  }), false);
});

test("signature verification rejects wrong keys, changed orders and non-string inputs", () => {
  const input = {
    keyId: "rzp_test_securitycheck", keySecret: "unit-test-secret",
    orderId: "order_123", paymentId: "pay_123", signature: sign("order_123", "pay_123"), production: true,
  };
  assert.equal(verifyRazorpaySignature({ ...input, keySecret: "wrong-secret" }), false);
  assert.equal(verifyRazorpaySignature({ ...input, orderId: "order_other" }), false);
  for (const key of ["keyId", "keySecret", "orderId", "paymentId", "signature"]) {
    for (const value of [undefined, null, 123, [], {}]) {
      assert.equal(verifyRazorpaySignature({ ...input, [key]: value }), false);
    }
  }
});

test("RazorpayProvider delegates to strict production signature validation", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const provider = new RazorpayProvider("rzp_test_securitycheck", "unit-test-secret", "webhook-secret");
    const signature = sign("order_123", "pay_123");
    assert.equal(provider.verifySignature("order_123", "pay_123", signature), true);
    assert.equal(provider.verifySignature("order_123", "pay_123", "signature_simulated"), false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test("RazorpayProvider verifies webhook HMAC before parsing events", async () => {
  const provider = new RazorpayProvider("rzp_test_securitycheck", "unit-test-secret", "webhook-secret");
  const rawBody = Buffer.from(JSON.stringify({ event: "payment.authorized" }));
  const signature = crypto.createHmac("sha256", "webhook-secret").update(rawBody).digest("hex");
  assert.deepEqual(await provider.verifyWebhook(rawBody, { "x-razorpay-signature": signature }), { success: false });
  await assert.rejects(
    provider.verifyWebhook(rawBody, { "x-razorpay-signature": "not-a-signature" }),
    /signature verification failed/
  );
});

test("captured lookup binds status, captured flag, amount, currency and order", async t => {
  const provider = new RazorpayProvider("rzp_test_fixture", "unit-test-secret", "webhook-secret");
  const payment = { id: "pay_123", order_id: "order_123", status: "captured", captured: true, currency: "INR", amount: 10000 };
  t.mock.method(provider.razorpay.payments, "fetch", async () => payment);
  assert.equal(await provider.confirmCapturedPayment("order_123", "pay_123", 10000), true);
  for (const [key, value] of [["status", "authorized"], ["captured", false], ["currency", "USD"], ["amount", 100], ["order_id", "order_other"]]) {
    const original = payment[key]; payment[key] = value;
    assert.equal(await provider.confirmCapturedPayment("order_123", "pay_123", 10000), false);
    payment[key] = original;
  }
});

test("RazorpayProvider binds paid webhook payment and order amounts and IDs", async () => {
  const provider = new RazorpayProvider("rzp_test_securitycheck", "unit-test-secret", "webhook-secret");
  const payload = {
    event: "order.paid",
    payload: {
      order: { entity: {
        id: "order_123", status: "paid", currency: "INR", amount: 1500000, amount_paid: 1500000,
        notes: { projectId: "project-1", bidId: "bid-1", clientId: "client-1", studentId: "student-1", amount: "15000" },
      } },
      payment: { entity: {
        id: "pay_123", order_id: "order_123", currency: "INR", amount: 1500000, status: "captured", captured: true,
      } },
    },
  };
  const rawBody = Buffer.from(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", "webhook-secret").update(rawBody).digest("hex");
  const result = await provider.verifyWebhook(rawBody, { "x-razorpay-signature": signature });
  assert.equal(result.success, true);
  assert.equal(result.paymentIntentId, "pay_123");
  assert.equal(result.bidId, "bid-1");
  assert.equal(result.amount, 15000);
  payload.payload.order.entity.notes.amount = "999999";
  const wrongNotes = Buffer.from(JSON.stringify(payload));
  const wrongNotesSig = crypto.createHmac("sha256", "webhook-secret").update(wrongNotes).digest("hex");
  assert.equal((await provider.verifyWebhook(wrongNotes, { "x-razorpay-signature": wrongNotesSig })).amountPaise, 1500000);

  payload.payload.payment.entity.amount = 100;
  const mismatchedBody = Buffer.from(JSON.stringify(payload));
  const mismatchedSignature = crypto.createHmac("sha256", "webhook-secret").update(mismatchedBody).digest("hex");
  await assert.rejects(
    provider.verifyWebhook(mismatchedBody, { "x-razorpay-signature": mismatchedSignature }),
    /do not match a captured INR payment/
  );
});

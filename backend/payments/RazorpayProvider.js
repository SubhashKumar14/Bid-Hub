import { PaymentProvider } from "./PaymentProvider.js";
import Razorpay from "razorpay";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { verifyRazorpaySignature } from "./razorpay-signature.js";
import crypto from "crypto";

export class RazorpayProvider extends PaymentProvider {
  constructor(keyId, keySecret, webhookSecret) {
    super();
    if (!keyId || !keySecret || keyId === "rzp_test_placeholder" || keySecret === "placeholdersecret") {
      throw new Error("Valid Razorpay API credentials are required.");
    }
    this.razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.webhookSecret = webhookSecret;
  }

  async createCheckout(project, bid, numericAmount, clientUrl) {
    const studentId = bid.studentId._id || bid.studentId;

    const order = await this.razorpay.orders.create({
        amount: Math.round(numericAmount * 100), // in paise
        currency: "INR",
        receipt: "rcpt_" + Math.random().toString(36).substring(2, 10),
        notes: {
          projectId: project._id.toString(),
          bidId: bid._id.toString(),
          clientId: project.clientId.toString(),
          studentId: studentId.toString(),
          amount: String(numericAmount),
        },
    });

    // Create PaymentLedger record in PENDING_CHECKOUT state (map order.id to stripeSessionId)
    await PaymentLedger.create({
      projectId: project._id,
      clientId: project.clientId,
      studentId: studentId,
      amount: numericAmount,
      status: "PENDING_CHECKOUT",
      stripeSessionId: order.id, // Reused field for generic payment ID
      transactionRef: "TXN-RAZOR-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
    });

    return {
      provider: "razorpay",
      keyId: this.keyId,
      amount: order.amount,
      currency: order.currency,
      orderId: order.id,
      description: `Escrow Deposit: "${project.title}"`,
      notes: order.notes,
    };
  }

  verifySignature(orderId, paymentId, signature) {
    return verifyRazorpaySignature({
      keyId: this.keyId,
      keySecret: this.keySecret,
      orderId,
      paymentId,
      signature,
      production: process.env.NODE_ENV === "production",
    });
  }

  async verifyWebhook(rawBody, headers) {
    const sig = headers["x-razorpay-signature"];
    if (!this.webhookSecret || !sig) {
      throw new Error("Webhook verification failed: x-razorpay-signature or webhook secret missing.");
    }

    // Verify webhook signature
    const expected = crypto.createHmac("sha256", this.webhookSecret).update(rawBody).digest();
    if (
      typeof sig !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(sig) ||
      !crypto.timingSafeEqual(Buffer.from(sig, "hex"), expected)
    ) {
      throw new Error("Razorpay webhook signature verification failed.");
    }

    const payload = JSON.parse(rawBody.toString());
    const eventType = payload.event;

    // Razorpay webhook payload for payment captured or order paid
    if (eventType === "order.paid") {
      const order = payload.payload.order.entity;
      const payment = payload.payload.payment.entity;
      if (
        order.status !== "paid" ||
        order.currency !== "INR" ||
        Number(order.amount_paid) !== Number(order.amount) ||
        payment.order_id !== order.id ||
        payment.currency !== order.currency ||
        Number(payment.amount) !== Number(order.amount) ||
        (payment.status !== "captured" && payment.captured !== true)
      ) {
        throw new Error("Razorpay order and payment details do not match a captured INR payment.");
      }
      const { projectId, bidId, clientId, studentId, amount } = order.notes;

      return {
        projectId,
        bidId,
        clientId,
        studentId,
        amount: parseFloat(amount),
        sessionId: order.id,
        paymentIntentId: payment.id,
        success: true,
      };
    }

    return { success: false };
  }
}

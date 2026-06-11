import { PaymentProvider } from "./PaymentProvider.js";
import Razorpay from "razorpay";
import { PaymentLedger } from "../models/PaymentLedger.js";
import crypto from "crypto";

export class RazorpayProvider extends PaymentProvider {
  constructor(keyId, keySecret, webhookSecret) {
    super();
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

    // Create Razorpay Order
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
    // Strictly validate payment ID pattern and reject mock values in production
    if (process.env.NODE_ENV === "production") {
      const isRealPattern = /^pay_[a-zA-Z0-9]+$/.test(paymentId);
      const isMockPattern = /mock|test/i.test(paymentId);
      if (!isRealPattern || isMockPattern) {
        console.warn(`[Security Alert] Rejected invalid or mock payment ID in production: "${paymentId}"`);
        return false;
      }
    }
    const shasum = crypto.createHmac("sha256", this.keySecret);
    shasum.update(orderId + "|" + paymentId);
    const generated = shasum.digest("hex");
    return generated === signature;
  }

  async verifyWebhook(rawBody, headers) {
    const sig = headers["x-razorpay-signature"];
    if (!this.webhookSecret || !sig) {
      throw new Error("Webhook verification failed: x-razorpay-signature or webhook secret missing.");
    }

    // Verify webhook signature
    const shasum = crypto.createHmac("sha256", this.webhookSecret);
    shasum.update(rawBody);
    const generated = shasum.digest("hex");

    if (generated !== sig) {
      throw new Error("Razorpay webhook signature verification failed.");
    }

    const payload = JSON.parse(rawBody.toString());
    const eventType = payload.event;

    // Razorpay webhook payload for payment captured or order paid
    if (eventType === "order.paid") {
      const order = payload.payload.order.entity;
      const payment = payload.payload.payment.entity;
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

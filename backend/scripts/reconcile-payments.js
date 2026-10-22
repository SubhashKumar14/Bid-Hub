import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { getPaymentProvider } from "../payments/index.js";
import { PaymentEvent } from "../models/PaymentEvent.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { settlePayment } from "../payments/settle.js";

// Bounded operator-triggered retry. This job never refunds or transfers money.
try {
  const provider = getPaymentProvider();
  if (typeof provider.confirmCapturedPayment !== "function") throw new Error("Reconciliation requires the Razorpay test provider.");
  await connectDB();
  const events = await PaymentEvent.find({ status: { $ne: "PROCESSED" } }).sort({ createdAt: 1 }).limit(50);
  for (const event of events) {
    try {
      const deposit = await PaymentLedger.findOne({ stripeSessionId: event.orderId, milestoneId: null });
      let processed = false;
      if (deposit?.bidId && deposit.amountPaise === event.amountPaise &&
          await provider.confirmCapturedPayment(event.orderId, event.paymentId, event.amountPaise)) {
        processed = await settlePayment(deposit.projectId, deposit.bidId, deposit.amount, event.orderId, event.paymentId);
      }
      event.status = processed ? "PROCESSED" : "NEEDS_RECONCILIATION";
      event.reason = processed ? "" : "Operator review required: missing, cancelled, legacy, mismatched or conflicting contract.";
      await event.save();
    } catch {
      event.status = "NEEDS_RECONCILIATION";
      event.reason = "Retry failed; inspect provider and database availability.";
      await event.save();
    }
  }
  console.log(`Reviewed ${events.length} payment events. No refunds or payouts were initiated.`);
} finally { await mongoose.disconnect(); }

import mongoose from "mongoose";

const schema = new mongoose.Schema({
  paymentId: { type: String, required: true, unique: true },
  orderId: { type: String, required: true },
  amountPaise: { type: Number, required: true },
  status: { type: String, enum: ["RECEIVED", "PROCESSED", "NEEDS_RECONCILIATION"], default: "RECEIVED" },
  reason: String,
}, { timestamps: true });
export const PaymentEvent = mongoose.model("PaymentEvent", schema);

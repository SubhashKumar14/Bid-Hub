import { sampleFields } from "../lib/sample-fields.js";
import { amountToPaise } from "../lib/validation.js";
import mongoose from "mongoose";

const paymentLedgerSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    milestoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Milestone", default: null }, // optional for full project deposits
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true, validate: value => { try { amountToPaise(value); return true; } catch { return false; } } }, // Store as Number for precise math
    amountPaise: { type: Number, min: 1, validate: Number.isSafeInteger },
    bidId: { type: mongoose.Schema.Types.ObjectId, ref: "Bid" },
    provider: { type: String, enum: ["mock", "razorpay", "sample"] },
    allocationSchedule: [{ milestoneId: mongoose.Schema.Types.ObjectId, amountPaise: Number }],
    status: {
      type: String,
      enum: ["PENDING_CHECKOUT", "LOCKED", "PENDING_REVIEW", "RELEASED", "FAILED", "REFUNDED", "UNVERIFIED"],
      default: "PENDING_CHECKOUT",
    },
    transactionRef: { type: String, default: function () { return `TEST-RECEIPT-${this?._id || new mongoose.Types.ObjectId()}`; }, immutable: true },
    receiptRef: { type: String, default: function () { return `TEST-RECEIPT-${this?._id || new mongoose.Types.ObjectId()}`; }, immutable: true },
    stripeSessionId: { type: String, default: "" },
    stripePaymentIntentId: { type: String, default: "" },
    stripeTransferId: { type: String, default: "" },
    releasedAt: { type: Date, default: null },
    settlementNote: { type: String, default: "" },
  },
  { timestamps: true }
);

// Index for fetching all ledger entries for a project (escrow drawer)
paymentLedgerSchema.index({ projectId: 1 });
// Index for fetching student's earnings
paymentLedgerSchema.index({ studentId: 1, status: 1 });
// Index for fetching client's locked escrow
paymentLedgerSchema.index({ clientId: 1, status: 1 });
// Index on transactionRef for audit lookups
paymentLedgerSchema.index({ transactionRef: 1 }, { sparse: true });
paymentLedgerSchema.index({ receiptRef: 1 }, { unique:true, partialFilterExpression:{receiptRef:{$type:"string"}} });

sampleFields(paymentLedgerSchema);
export const PaymentLedger = mongoose.model("PaymentLedger", paymentLedgerSchema);

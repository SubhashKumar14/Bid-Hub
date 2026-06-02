import mongoose from "mongoose";

const paymentLedgerSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    milestoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Milestone", required: true },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: String, required: true },
    status: {
      type: String,
      enum: ["LOCKED", "PENDING", "RELEASED"],
      default: "LOCKED",
    },
    transactionRef: { type: String, default: "" },
    releasedAt: { type: Date, default: null },
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

export const PaymentLedger = mongoose.model("PaymentLedger", paymentLedgerSchema);

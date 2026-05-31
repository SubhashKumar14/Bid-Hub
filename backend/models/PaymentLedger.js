import mongoose from "mongoose";

const paymentLedgerSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    milestoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Milestone" },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      required: true,
      enum: ["LOCKED", "PENDING", "RELEASED", "COMPLETED", "CANCELLED"],
      default: "LOCKED",
    },
    transactionRef: { type: String, required: true, unique: true },
    releasedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const PaymentLedger = mongoose.model("PaymentLedger", paymentLedgerSchema);

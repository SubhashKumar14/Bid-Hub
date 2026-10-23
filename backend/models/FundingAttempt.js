import mongoose from "mongoose";
const schema = new mongoose.Schema({
  contractId: { type: mongoose.Schema.Types.ObjectId, unique: true, required: true },
  state: { type: String, enum: ["CREATING", "READY", "RECOVERY_REQUIRED"], default: "CREATING" },
  checkout: mongoose.Schema.Types.Mixed,
  reason: String,
}, { timestamps: true });
export const FundingAttempt = mongoose.model("FundingAttempt", schema);

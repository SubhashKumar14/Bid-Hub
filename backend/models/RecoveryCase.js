import mongoose from "mongoose";
const schema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: { type: String, required: true },
  state: { type: String, enum: ["OPERATOR_REVIEW", "RESOLVED"], default: "OPERATOR_REVIEW" },
  resolution: String,
}, { timestamps: true });
export const RecoveryCase = mongoose.model("RecoveryCase", schema);

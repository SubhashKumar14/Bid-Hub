import mongoose from "mongoose";
const schema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  reason: { type: String, required: true },
  state: { type: String, enum: ["OPERATOR_REVIEW", "RESOLVED"], default: "OPERATOR_REVIEW" },
  resolution: String,
  version: { type: Number, default: 1 },
  history: [{ requestId: String, action: String, actorId: mongoose.Schema.Types.ObjectId, reason: String, beforeProjectState: String, afterProjectState: String, at: Date }],
}, { timestamps: true });
export const RecoveryCase = mongoose.model("RecoveryCase", schema);

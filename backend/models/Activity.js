import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, required: true }, // e.g. "PROJECT_POSTED", "BID_PLACED", etc.
    message: { type: String, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null }, // References Project, Bid, or Milestone
  },
  { timestamps: true }
);

export const Activity = mongoose.model("Activity", activitySchema);

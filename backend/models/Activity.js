import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    type: { type: String, required: true },
    message: { type: String, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true }
);

// Index for fetching recent activity feed (sorted by newest)
activitySchema.index({ createdAt: -1 });
// TTL index: auto-delete activity entries older than 14 days
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });

export const Activity = mongoose.model("Activity", activitySchema);

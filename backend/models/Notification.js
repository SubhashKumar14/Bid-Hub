import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    // Who receives this notification
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Type of notification for icon/color rendering on frontend
    type: {
      type: String,
      required: true,
      enum: [
        "BID_RECEIVED",      // Client receives when student bids
        "BID_ACCEPTED",      // Student receives when bid accepted
        "BID_REJECTED",      // Student receives when bid rejected
        "MILESTONE_SUBMITTED", // Client receives when student submits milestone
        "MILESTONE_RELEASED",  // Student receives when client releases milestone
        "MILESTONE_CHANGES_REQUESTED", // Student receives when client requests revisions
        "PROJECT_COMPLETED",   // Both parties receive on project completion
        "REVIEW_RECEIVED",     // User receives when they get a review
        "PROJECT_ASSIGNED",    // Student receives when assigned to project
        "MESSAGE_RECEIVED",    // Receives when user gets a message
      ],
    },
    // Human-readable notification message
    message: { type: String, required: true },
    // Optional link target (e.g. project ID)
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Whether the user has seen this notification
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Critical index: fetch unread notifications for a user (bell icon count)
notificationSchema.index({ recipientId: 1, read: 1, createdAt: -1 });
// TTL index: auto-delete notifications older than 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const Notification = mongoose.model("Notification", notificationSchema);

import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    content: { type: String, required: true },
  },
  { timestamps: true }
);

// Index for project-level chat query (ordered by time)
messageSchema.index({ projectId: 1, createdAt: 1 });

export const Message = mongoose.model("Message", messageSchema);

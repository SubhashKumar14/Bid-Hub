import mongoose from "mongoose";

const milestoneSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true },
    amount: { type: String, required: true },
    dueDate: { type: String },
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "SUBMITTED", "APPROVED", "RELEASED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

export const Milestone = mongoose.model("Milestone", milestoneSchema);

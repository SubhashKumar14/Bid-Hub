import mongoose from "mongoose";

const milestoneSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    dueDate: { type: String },
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "SUBMITTED", "APPROVED", "RELEASED", "CHANGES_REQUESTED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

export const Milestone = mongoose.model("Milestone", milestoneSchema);

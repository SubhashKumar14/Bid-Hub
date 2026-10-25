import { sampleFields } from "../lib/sample-fields.js";
import { amountToPaise } from "../lib/validation.js";
import mongoose from "mongoose";

const milestoneSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    title: { type: String, required: true },
    amount: { type: Number, required: true, validate: value => { try { amountToPaise(value); return true; } catch { return false; } } },
    dueDate: { type: String },
    activeSubmissionId: { type: mongoose.Schema.Types.ObjectId, ref: "MilestoneSubmission" },
    status: {
      type: String,
      required: true,
      enum: ["PENDING", "SUBMITTED", "APPROVED", "RELEASED", "CHANGES_REQUESTED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

sampleFields(milestoneSchema);
export const Milestone = mongoose.model("Milestone", milestoneSchema);

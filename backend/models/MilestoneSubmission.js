import { sampleFields } from "../lib/sample-fields.js";
import mongoose from "mongoose";

const milestoneSubmissionSchema = new mongoose.Schema(
  {
    milestoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Milestone", required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    version: { type: Number, default: 1, min: 1 },
    githubUrl: { type: String, default: "" },
    demoUrl: { type: String, default: "" },
    videoUrl: { type: String, default: "" },
    description: { type: String, required: true }, // notes to client
    attachments: [
      {
        name: { type: String },
        url: { type: String },
      },
    ],
    reviewComment: { type: String, default: "" }, // client feedback
    status: {
      type: String,
      enum: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "CHANGES_REQUESTED", "APPROVED"],
      default: "SUBMITTED",
    },
  },
  { timestamps: true }
);

// Index for fast query of submissions on a milestone
milestoneSubmissionSchema.index({ milestoneId: 1, createdAt: -1 });
milestoneSubmissionSchema.index({ milestoneId: 1, version: 1 }, { unique: true });

sampleFields(milestoneSubmissionSchema);
export const MilestoneSubmission = mongoose.model("MilestoneSubmission", milestoneSubmissionSchema);

import mongoose from "mongoose";

const milestoneSubmissionSchema = new mongoose.Schema(
  {
    milestoneId: { type: mongoose.Schema.Types.ObjectId, ref: "Milestone", required: true },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    githubUrl: { type: String, required: true },
    demoUrl: { type: String, default: "" },
    description: { type: String, default: "" }, // notes to client
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

export const MilestoneSubmission = mongoose.model("MilestoneSubmission", milestoneSubmissionSchema);

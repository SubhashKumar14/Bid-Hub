import mongoose from "mongoose";

const bidSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: String, required: true },
    timeline: { type: String, required: true },
    proposal: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

// Index for fetching all bids on a project (client view)
bidSchema.index({ projectId: 1, status: 1 });
// Index for fetching a student's own bids (student view)
bidSchema.index({ studentId: 1, status: 1 });
// Compound unique index: one bid per student per project
bidSchema.index({ projectId: 1, studentId: 1 }, { unique: true });

export const Bid = mongoose.model("Bid", bidSchema);

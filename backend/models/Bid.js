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
      required: true,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"],
      default: "PENDING",
    },
  },
  { timestamps: true }
);

export const Bid = mongoose.model("Bid", bidSchema);

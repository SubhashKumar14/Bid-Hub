import { sampleFields } from "../lib/sample-fields.js";
import { amountToPaise } from "../lib/validation.js";
import mongoose from "mongoose";

const bidSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amount: { type: String, required: true, validate: value => { try { amountToPaise(value); return true; } catch { return false; } } },
    timeline: { type: String, required: true },
    proposal: { type: String, required: true },
    version: { type: Number, default: 1 },
    agreementLock: { type: Number, default: 0 },
    history: [{ version: Number, amount: String, timeline: String, proposal: String, schedule: mongoose.Schema.Types.Mixed }],
    schedule: [{ milestoneId: mongoose.Schema.Types.ObjectId, title: String, amountPaise: Number }],
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "REJECTED", "WITHDRAWN"],
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

sampleFields(bidSchema);
export const Bid = mongoose.model("Bid", bidSchema);

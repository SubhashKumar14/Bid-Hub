import { sampleFields } from "../lib/sample-fields.js";
import mongoose from "mongoose";
const schema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, immutable: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  bidId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  proposalVersion: { type: Number, required: true, immutable: true },
  totalPaise: { type: Number, required: true, immutable: true },
  currency: { type: String, default: "INR", immutable: true },
  timeline: { type: String, immutable: true },
  proposal: { type: String, immutable: true },
  brief: { type: String, immutable: true },
  scope: { type: mongoose.Schema.Types.Mixed, immutable: true },
  title: { type: String, immutable: true },
  category: { type: String, immutable: true },
  skillsRequired: { type: [String], immutable: true },
  deliveryDeadline: { type: String, immutable: true },
  advertisedBudgetPaise: { type: Number, immutable: true },
  evidencePolicy: { type: String, default: "Describe completed work in notes; attach files or HTTPS links appropriate to the checkpoint. Software links are not universally required.", immutable: true },
  schedule: { type: [{
    milestoneId: { type: mongoose.Schema.Types.ObjectId, immutable: true },
    title: { type: String, immutable: true },
    amountPaise: { type: Number, immutable: true },
    dueDate: { type: String, immutable: true },
  }], immutable: true },
}, { timestamps: true });
sampleFields(schema);
export const Contract = mongoose.model("Contract", schema);

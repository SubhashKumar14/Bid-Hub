import { sampleFields } from "../lib/sample-fields.js";
import { amountToPaise } from "../lib/validation.js";
import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    budget: { type: Number, required: true, validate: value => { try { amountToPaise(value); return true; } catch { return false; } } },
    deadline: { type: String, required: true },
    remote: { type: Boolean, default: null },
    location: { type: String, default: "" },
    level: { type: String, enum: ["", "beginner", "intermediate", "advanced", "expert", "any"], default: "" },
    duration: { type: String, default: "" },
    contractTotalPaise: Number,
    clientRequestId: String,
    publishFingerprint: String,
    recoveryPending: { type: Boolean, default: false },
    skillsRequired: { type: [String], default: [] },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      required: true,
      enum: ["OPEN", "PENDING_FUNDING", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      default: "OPEN",
    },
    files: [
      {
        name: { type: String },
        url: { type: String },
      },
    ],
    bidsCount: { type: Number, default: 0 },
    acceptedBidId: { type: mongoose.Schema.Types.ObjectId, ref: "Bid", default: null },
    // Manifest schema representation for Github / local zip import metadata
    fileManifest: { type: Array, default: [] },
    importRevision: { type: String, default: "" },
    importSource: { type: String, default: "" }, // "local", "zip", "github"
  },
  { timestamps: true }
);

// Index for project wall listing (open projects sorted by newest)
projectSchema.index({ status: 1, createdAt: -1 });
// Index for fetching a client's own projects
projectSchema.index({ clientId: 1, status: 1 });
// Text index for search by title and description
projectSchema.index({ title: "text", description: "text" });

projectSchema.index({ clientId: 1, clientRequestId: 1 }, { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } });

sampleFields(projectSchema);
export const Project = mongoose.model("Project", projectSchema);

import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    budget: { type: String, required: true },
    deadline: { type: String, required: true },
    skillsRequired: { type: [String], default: [] },
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    status: {
      type: String,
      required: true,
      enum: ["OPEN", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
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
    importSource: { type: String, default: "" }, // "local", "zip", "github"
  },
  { timestamps: true }
);

export const Project = mongoose.model("Project", projectSchema);

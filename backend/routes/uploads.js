import express from "express";
import { createRouter } from "../lib/router.js";
import { upload } from "../config/cloudinary.js";
import { protect } from "../middleware/auth.js";
import { Upload } from "../models/Upload.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Milestone } from "../models/Milestone.js";
import { MilestoneSubmission } from "../models/MilestoneSubmission.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const router = createRouter();

const getFileUrl = (file) => {
  if (file.path && file.path.startsWith("http")) {
    return file.path; // Cloudinary URL
  }
  return `/api/uploads/files/${file.filename}`;
};


// @desc    Upload multiple files
// @route   POST /api/uploads/files
// @access  Private
router.post("/files", protect, upload.array("files", 10), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No files provided" });
  }

  await Upload.insertMany(req.files.map(file => ({ ownerId: req.user._id, filename: file.filename, name: file.originalname, size: file.size })));
  const uploadedFiles = req.files.map((file) => ({
    name: file.originalname,
    url: getFileUrl(file),
  }));

  res.json(uploadedFiles);
});

router.get("/files/:filename", protect, async (req, res) => {
  const file = await Upload.findOne({ filename: req.params.filename });
  if (!file) return res.status(404).json({ message: "File not found." });
  if (String(file.ownerId) !== String(req.user._id)) {
    const url = `/api/uploads/files/${file.filename}`;
    let project = await Project.findOne({ "files.url": url, clientId: file.ownerId });
    if (!project) {
      const submission = await MilestoneSubmission.findOne({ "attachments.url": url, submittedBy: file.ownerId });
      const milestone = submission && await Milestone.findById(submission.milestoneId);
      project = milestone && await Project.findById(milestone.projectId);
    }
    const bid = project?.acceptedBidId && await Bid.findById(project.acceptedBidId);
    if (!project || (String(project.clientId) !== String(req.user._id) && String(bid?.studentId) !== String(req.user._id))) return res.status(404).json({ message: "File not found." });
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  const directory = process.env.PRIVATE_UPLOAD_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../private-uploads");
  res.download(path.join(directory, file.filename), file.name);
});

export default router;

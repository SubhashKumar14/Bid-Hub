import { downloadMongoFile } from "../storage/private.js";
import express from "express";
import { createRouter } from "../lib/router.js";
import { upload, privateUploadDirectory, requirePrivateUploadStorage } from "../config/cloudinary.js";
import { protect } from "../middleware/auth.js";
import { Upload } from "../models/Upload.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Contract } from "../models/Contract.js";
import { Milestone } from "../models/Milestone.js";
import { MilestoneSubmission } from "../models/MilestoneSubmission.js";
import path from "node:path";

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
router.post("/files", protect, requirePrivateUploadStorage, upload.array("files", 10), async (req, res) => {
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

router.get("/files/:filename", protect, requirePrivateUploadStorage, async (req, res, next) => {
  const file = await Upload.findOne({ filename: req.params.filename });
  if (!file) return res.status(404).json({ message: "File not found." });
  if (String(file.ownerId) !== String(req.user._id)) {
    const url = `/api/uploads/files/${file.filename}`;
    const publishedBrief = req.user.role === "student" && await Project.exists({ "files.url": url, clientId: file.ownerId, status: "OPEN" });
    if (!publishedBrief) {
      // A file can be deliberately reused in more than one authorized association.
      // Test every linked project instead of trusting whichever findOne returns first.
      const briefIds = await Project.find({ "files.url": url, clientId: file.ownerId }).distinct("_id");
      const milestoneIds = await MilestoneSubmission.find({ "attachments.url": url, submittedBy: file.ownerId }).distinct("milestoneId");
      const workIds = await Milestone.find({ _id: { $in: milestoneIds } }).distinct("projectId");
      const ids = [...briefIds, ...workIds];
      const acceptedIds = await Bid.find({ studentId: req.user._id, status: "ACCEPTED", projectId: { $in: ids } }).distinct("_id");
      const owned = await Project.exists({ _id: { $in: ids }, $or: [{ clientId: req.user._id }, { acceptedBidId: { $in: acceptedIds } }] });
      const agreed = await Contract.exists({ projectId: { $in: ids }, studentId: req.user._id });
      if (!owned && !agreed) return res.status(404).json({ message: "File not found." });
    }
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (process.env.PRIVATE_STORAGE === "mongodb") return downloadMongoFile(file, res, next);
  res.download(path.join(privateUploadDirectory, file.filename), file.name);
});

export default router;

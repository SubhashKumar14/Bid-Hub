import { httpErrorStatus } from "../lib/validation.js";
import mongoose from "mongoose";
import { getActiveProviderName } from "../payments/index.js";
import express from "express";
import { createRouter } from "../lib/router.js";
import { Milestone } from "../models/Milestone.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { User } from "../models/User.js";
import { Activity } from "../models/Activity.js";
import { Notification } from "../models/Notification.js";
import { protect, requireRole } from "../middleware/auth.js";
import { MilestoneSubmission } from "../models/MilestoneSubmission.js";

const router = createRouter();

const parseAmount = (val) => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const cleaned = val.toString().replace(/[₹$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};


// @desc    Submit milestone work (Student)
// @route   PATCH /api/milestones/:id/submit
// @access  Private (Student only)
router.patch("/:id/submit", protect, requireRole("student"), async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found." });
    }

    const project = await Project.findById(milestone.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Verify student is the accepted bidder
    const acceptedBid = await Bid.findById(project.acceptedBidId);
    if (!acceptedBid || acceptedBid.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not assigned to this project." });
    }

    if (milestone.status === "RELEASED") {
      return res.status(400).json({ message: "This milestone is already complete." });
    }

    const { githubUrl, demoUrl, videoUrl, description, attachments } = req.body;
    const httpsUrl = (value, host) => {
      if (typeof value !== "string" || value.length > 2048) return false;
      try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && (!host || url.hostname === host); } catch { return false; }
    };
    if (!httpsUrl(githubUrl, "github.com") || !httpsUrl(demoUrl) || !httpsUrl(videoUrl) || typeof description !== "string" || description.length > 10000) return res.status(400).json({ message: "Valid HTTPS submission URLs and bounded notes are required." });

    if (!githubUrl || !githubUrl.trim()) {
      return res.status(400).json({ message: "GitHub Repository URL is required." });
    }
    if (!githubUrl.startsWith("http") || !githubUrl.includes("github.com")) {
      return res.status(400).json({ message: "Please provide a valid GitHub repository URL." });
    }

    if (!demoUrl || !demoUrl.trim() || !demoUrl.startsWith("http")) {
      return res.status(400).json({ message: "Please provide a valid Live Demo URL (starting with http/https)." });
    }

    if (!videoUrl || !videoUrl.trim() || !videoUrl.startsWith("http")) {
      return res.status(400).json({ message: "Please provide a valid Demo Video URL (starting with http/https)." });
    }

    if (!description || description.trim().length < 10) {
      return res.status(400).json({ message: "Submission Notes are required and must be at least 10 characters long." });
    }

    await mongoose.connection.transaction(async session => {
      const current = await Milestone.findOne({ _id: milestone._id, status: { $in: ["PENDING", "CHANGES_REQUESTED"] } }).session(session);
      const allocation = await PaymentLedger.findOne({ milestoneId: milestone._id, studentId: req.user._id, status: "LOCKED" }).session(session);
      if (!current || !allocation) throw Object.assign(new Error("Milestone is not eligible for a new submission."), { status: 409 });
      const latest = await MilestoneSubmission.findOne({ milestoneId: milestone._id }).sort({ version: -1 }).session(session);
      const [submission] = await MilestoneSubmission.create([{ milestoneId: milestone._id, submittedBy: req.user._id, version: (latest?.version || 0) + 1, githubUrl, demoUrl, videoUrl, description, attachments: attachments || [], status: "SUBMITTED" }], { session });
      current.status = "SUBMITTED";
      current.activeSubmissionId = submission._id;
      allocation.status = "PENDING_REVIEW";
      await current.save({ session });
      await allocation.save({ session });
      await Notification.create([{ recipientId: project.clientId, type: "MILESTONE_SUBMITTED", message: "New milestone submission is ready for review.", targetId: project._id }], { session });
    });
    res.json({ message: "Milestone submitted for client review.", milestone });
  } catch (error) {
    console.error("Submit milestone error:", error);
    res.status(error.status || 503).json({ message: error.status ? error.message : "Submission could not be committed. Please retry." });
  }
});

// @desc    Approve/Release milestone funds (Client)
// @route   PATCH /api/milestones/:id/release
// @access  Private (Client only)
router.patch("/:id/release", protect, requireRole("client"), async (req, res) => {
  const { status, reviewComment, submissionId } = req.body;
  if (!["APPROVED", "CHANGES_REQUESTED"].includes(status)) return res.status(400).json({ message: "Specify APPROVED or CHANGES_REQUESTED." });
  if (status === "CHANGES_REQUESTED" && (typeof reviewComment !== "string" || !reviewComment.trim() || reviewComment.length > 5000)) return res.status(400).json({ message: "Bounded review feedback is required." });
  // Real provider payouts are not implemented. Never invent a live transfer.
  if (status === "APPROVED" && (process.env.NODE_ENV === "production" || getActiveProviderName() !== "mock")) return res.status(503).json({ message: "Payout integration is unavailable. No funds were released." });
  if (typeof submissionId !== "string") return res.status(400).json({ message: "Submission ID is required for review." });
  try {
    const result = await mongoose.connection.transaction(async session => {
      const milestone = await Milestone.findById(req.params.id).session(session);
      if (!milestone) throw Object.assign(new Error("Milestone not found."), { status: 404 });
      const project = await Project.findOne({ _id: milestone.projectId, clientId: req.user._id, status: { $in: ["ASSIGNED", "IN_PROGRESS"] } }).session(session);
      if (!project || milestone.status !== "SUBMITTED") throw Object.assign(new Error("Project or milestone is not eligible for review."), { status: 409 });
      const allocation = await PaymentLedger.findOne({ milestoneId: milestone._id, clientId: req.user._id, status: "PENDING_REVIEW" }).session(session);
      const submission = String(milestone.activeSubmissionId) === submissionId ? await MilestoneSubmission.findOne({ _id: submissionId, milestoneId: milestone._id, status: "SUBMITTED" }).session(session) : null;
      if (!allocation || !submission || (status === "APPROVED" && allocation.provider !== "mock")) throw Object.assign(new Error("Matching funded allocation and submission required."), { status: 409 });
      milestone.status = status === "APPROVED" ? "RELEASED" : "CHANGES_REQUESTED";
      submission.status = status;
      submission.reviewComment = status === "CHANGES_REQUESTED" ? reviewComment.trim() : "";
      allocation.status = status === "APPROVED" ? "RELEASED" : "LOCKED";
      // No transfer ID: this records only an explicitly simulated demo release.
      allocation.stripeTransferId = "";
      allocation.releasedAt = status === "APPROVED" ? new Date() : null;
      await milestone.save({ session });
      await submission.save({ session });
      await allocation.save({ session });
      const remaining = await Milestone.countDocuments({ projectId: project._id, status: { $ne: "RELEASED" } }).session(session);
      if (remaining === 0) {
        project.status = "COMPLETED";
        await project.save({ session });
        await User.updateOne({ _id: allocation.studentId }, { $inc: { completedProjects: 1 } }, { session });
      }
      await Notification.create([{ recipientId: allocation.studentId, type: status === "APPROVED" ? "MILESTONE_RELEASED" : "MILESTONE_CHANGES_REQUESTED", message: status === "APPROVED" ? "Demo milestone approved. No real money was transferred." : reviewComment.trim(), targetId: project._id }], { session });
      return { milestone, project };
    });
    res.json({ ...result, simulated: status === "APPROVED", message: status === "APPROVED" ? "Demo milestone approved. No real money was transferred." : "Changes requested." });
  } catch (error) {
    res.status(error.status || 503).json({ message: error.status ? error.message : "Review could not be committed. Please retry." });
  }
});

// @desc    Get latest submission for a milestone
// @route   GET /api/milestones/:id/submission
// @access  Private (Client or Assigned Student only)
router.get("/:id/submission", protect, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found." });
    }

    const project = await Project.findById(milestone.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Verify authorized user
    const acceptedBid = await Bid.findById(project.acceptedBidId);
    const isStudent = acceptedBid && acceptedBid.studentId.toString() === req.user._id.toString();
    const isClient = project.clientId.toString() === req.user._id.toString();

    if (!isStudent && !isClient) {
      return res.status(403).json({ message: "Not authorized to view this milestone's submissions." });
    }

    const submission = await MilestoneSubmission.findOne({ milestoneId: req.params.id }).sort({ version: -1, createdAt: -1 })
      .populate("submittedBy", "name avatarUrl");

    res.json(submission || null);
  } catch (error) {
    console.error("Get milestone submission error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to load milestone submission." });
  }
});


export default router;

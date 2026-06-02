import express from "express";
import { Milestone } from "../models/Milestone.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { User } from "../models/User.js";
import { Activity } from "../models/Activity.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

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

    if (milestone.status === "SUBMITTED") {
      return res.status(400).json({ message: "This milestone has already been submitted. Wait for the client to review it." });
    }

    milestone.status = "SUBMITTED";
    await milestone.save();

    // Update escrow ledger status
    await PaymentLedger.updateOne(
      { milestoneId: milestone._id },
      { status: "PENDING" }
    );

    // Log Activity
    await Activity.create({
      actorId: req.user._id,
      type: "MILESTONE_SUBMITTED",
      message: `${req.user.name} submitted milestone work: "${milestone.title}"`,
      targetId: project._id,
    });

    res.json({ message: "Milestone submitted for client review.", milestone });
  } catch (error) {
    console.error("Submit milestone error:", error);
    res.status(500).json({ message: "Failed to submit milestone. Please try again." });
  }
});

// @desc    Approve/Release milestone funds (Client)
// @route   PATCH /api/milestones/:id/release
// @access  Private (Client only)
router.patch("/:id/release", protect, requireRole("client"), async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found." });
    }

    const project = await Project.findById(milestone.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Verify client ownership
    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not the client for this project." });
    }

    if (milestone.status === "RELEASED") {
      return res.status(400).json({ message: "Funds for this milestone have already been released." });
    }

    if (milestone.status !== "SUBMITTED") {
      return res.status(400).json({ message: "This milestone has not been submitted yet. Ask the student to submit their work first." });
    }

    milestone.status = "RELEASED";
    await milestone.save();

    // Update escrow ledger entry
    const ledger = await PaymentLedger.findOne({ milestoneId: milestone._id });
    if (ledger) {
      ledger.status = "RELEASED";
      ledger.releasedAt = new Date();
      await ledger.save();
    }

    // Log Activity
    await Activity.create({
      actorId: req.user._id,
      type: "MILESTONE_RELEASED",
      message: `${req.user.name} released funds for milestone: "${milestone.title}"`,
      targetId: project._id,
    });

    // Check if ALL milestones for this project are released
    const remainingMilestones = await Milestone.find({
      projectId: project._id,
      status: { $ne: "RELEASED" },
    });

    if (remainingMilestones.length === 0) {
      // Complete Project
      project.status = "COMPLETED";
      await project.save();

      // Find assigned student to increment completed projects count
      const acceptedBid = await Bid.findById(project.acceptedBidId);
      if (acceptedBid) {
        const student = await User.findById(acceptedBid.studentId);
        if (student) {
          student.completedProjects = (student.completedProjects || 0) + 1;
          await student.save();
        }
      }

      // Log Project Completed Activity
      await Activity.create({
        actorId: req.user._id,
        type: "PROJECT_COMPLETED",
        message: `Project "${project.title}" has been successfully completed!`,
        targetId: project._id,
      });
    }

    res.json({ message: "Milestone funds released successfully.", milestone, project });
  } catch (error) {
    console.error("Release milestone error:", error);
    res.status(500).json({ message: "Failed to release milestone funds. Please try again." });
  }
});

// @desc    Client adds a milestone manually
// @route   POST /api/milestones/projects/:id/milestones
// @access  Private (Client only)
router.post("/projects/:id/milestones", protect, requireRole("client"), async (req, res) => {
  const { title, amount, dueDate } = req.body;

  if (!title || !amount) {
    return res.status(400).json({ message: "Please provide a milestone title and amount." });
  }

  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found." });
    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to add milestones to this project." });
    }

    const milestone = await Milestone.create({
      projectId: project._id,
      title: title.trim(),
      amount,
      dueDate,
      status: "PENDING",
    });

    res.status(201).json(milestone);
  } catch (error) {
    console.error("Add milestone error:", error);
    res.status(500).json({ message: "Failed to add milestone. Please try again." });
  }
});

export default router;

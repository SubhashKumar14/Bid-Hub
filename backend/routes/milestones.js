import express from "express";
import { Milestone } from "../models/Milestone.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { User } from "../models/User.js";
import { Activity } from "../models/Activity.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// @desc    Submit milestone work (Student)
// @route   PATCH /api/milestones/:id/submit
// @access  Private (Student only)
router.patch("/:id/submit", protect, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found" });
    }

    const project = await Project.findById(milestone.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Verify student is accepted
    const acceptedBid = await Bid.findById(project.acceptedBidId);
    if (!acceptedBid || acceptedBid.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized. You are not assigned to this project" });
    }

    if (milestone.status !== "PENDING") {
      return res.status(400).json({ message: "Milestone has already been submitted or completed" });
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

    res.json({ message: "Milestone submitted for review", milestone });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Approve/Release milestone funds (Client)
// @route   PATCH /api/milestones/:id/release
// @access  Private (Client only)
router.patch("/:id/release", protect, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found" });
    }

    const project = await Project.findById(milestone.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Verify client ownership
    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to release funds for this project" });
    }

    if (milestone.status === "RELEASED") {
      return res.status(400).json({ message: "Milestone has already been released" });
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

    res.json({ message: "Milestone released successfully", milestone, project });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Client adds a milestone manually
// @route   POST /api/projects/:id/milestones
// @access  Private (Client only)
router.post("/projects/:id/milestones", protect, async (req, res) => {
  const { title, amount, dueDate } = req.body;
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const milestone = await Milestone.create({
      projectId: project._id,
      title,
      amount,
      dueDate,
      status: "PENDING",
    });

    res.status(201).json(milestone);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

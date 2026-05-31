import express from "express";
import { Bid } from "../models/Bid.js";
import { Project } from "../models/Project.js";
import { Milestone } from "../models/Milestone.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { Activity } from "../models/Activity.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router({ mergeParams: true });

// @desc    Submit a bid on a project
// @route   POST /api/projects/:id/bids
// @access  Private (Student only)
router.post("/projects/:id/bids", protect, requireRole("student"), async (req, res) => {
  const { amount, timeline, proposal } = req.body;
  const projectId = req.params.id;

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.status !== "OPEN") {
      return res.status(400).json({ message: "Bids are closed for this project" });
    }

    // Check if student already bid
    const existingBid = await Bid.findOne({ projectId, studentId: req.user._id });
    if (existingBid) {
      return res.status(400).json({ message: "You have already placed a bid on this project" });
    }

    const bid = await Bid.create({
      projectId,
      studentId: req.user._id,
      amount,
      timeline,
      proposal,
    });

    // Increment bid count in project
    project.bidsCount = (project.bidsCount || 0) + 1;
    await project.save();

    // Log Activity
    await Activity.create({
      actorId: req.user._id,
      type: "BID_PLACED",
      message: `${req.user.name} submitted a bid of ${amount} for "${project.title}"`,
      targetId: project._id,
    });

    res.status(201).json(bid);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get all bids for a project
// @route   GET /api/projects/:id/bids
// @access  Private (Client/Owner only)
router.get("/projects/:id/bids", protect, async (req, res) => {
  const projectId = req.params.id;

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Allow project owner or the students who placed a bid
    const isOwner = project.clientId.toString() === req.user._id.toString();
    
    let bids;
    if (isOwner) {
      bids = await Bid.find({ projectId }).populate(
        "studentId",
        "name avatarUrl rating completedProjects college skills"
      );
    } else {
      // Students can only see their own bid
      bids = await Bid.find({ projectId, studentId: req.user._id }).populate(
        "studentId",
        "name avatarUrl rating completedProjects college skills"
      );
    }

    res.json(bids);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Helper to generate transaction reference
const genTxnRef = () => "TXN-" + Math.random().toString(36).substring(2, 7).toUpperCase() + Math.random().toString(36).substring(2, 7).toUpperCase();

// @desc    Accept a bid
// @route   PATCH /api/bids/:id/accept
// @access  Private (Client only)
router.patch("/bids/:id/accept", protect, requireRole("client"), async (req, res) => {
  try {
    const bid = await Bid.findById(req.params.id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    const project = await Project.findById(bid.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    // Verify ownership
    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to accept this bid" });
    }

    if (project.status !== "OPEN") {
      return res.status(400).json({ message: "Project is already assigned or closed" });
    }

    // Accept this bid
    bid.status = "ACCEPTED";
    await bid.save();

    // Reject all other bids for this project
    await Bid.updateMany(
      { projectId: project._id, _id: { $ne: bid._id } },
      { status: "REJECTED" }
    );

    // Update project state
    project.status = "ASSIGNED";
    project.acceptedBidId = bid._id;
    await project.save();

    // Setup simulated escrow ledger entries for each milestone
    const milestones = await Milestone.find({ projectId: project._id });
    for (const milestone of milestones) {
      // Parse numeric amount from string like "₹12,000" or raw "12000"
      const numAmount = parseFloat(milestone.amount.replace(/[^0-9.]/g, "")) || 0;

      await PaymentLedger.create({
        projectId: project._id,
        milestoneId: milestone._id,
        clientId: project.clientId,
        studentId: bid.studentId,
        amount: numAmount,
        status: "LOCKED",
        transactionRef: genTxnRef(),
      });
    }

    // Log Activity
    await Activity.create({
      actorId: req.user._id,
      type: "BID_ACCEPTED",
      message: `${req.user.name} accepted bid from student for "${project.title}"`,
      targetId: project._id,
    });

    res.json({ message: "Bid accepted and milestones locked in escrow", bid, project });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Reject a bid
// @route   PATCH /api/bids/:id/reject
// @access  Private (Client only)
router.patch("/bids/:id/reject", protect, requireRole("client"), async (req, res) => {
  try {
    const bid = await Bid.findById(req.params.id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found" });
    }

    const project = await Project.findById(bid.projectId);
    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to reject this bid" });
    }

    bid.status = "REJECTED";
    await bid.save();

    res.json({ message: "Bid rejected", bid });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

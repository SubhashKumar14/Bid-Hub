import express from "express";
import { Bid } from "../models/Bid.js";
import { Project } from "../models/Project.js";
import { Milestone } from "../models/Milestone.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { Activity } from "../models/Activity.js";
import { Notification } from "../models/Notification.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router({ mergeParams: true });

// @desc    Submit a bid on a project
// @route   POST /api/projects/:id/bids
// @access  Private (Student only)
router.post("/projects/:id/bids", protect, requireRole("student"), async (req, res) => {
  const { amount, timeline, proposal } = req.body;
  const projectId = req.params.id;

  if (!amount || !timeline || !proposal) {
    return res.status(400).json({ message: "Please fill in all fields: bid amount, timeline, and proposal." });
  }

  if (Number(amount) <= 0) {
    return res.status(400).json({ message: "Bid amount must be a positive number." });
  }

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    if (project.status !== "OPEN") {
      return res.status(400).json({ message: "This project is no longer accepting bids." });
    }

    // Prevent a client from bidding on their own project
    if (project.clientId.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot bid on your own project." });
    }

    // Check if student already bid
    const existingBid = await Bid.findOne({ projectId, studentId: req.user._id });
    if (existingBid) {
      return res.status(400).json({ message: "You have already placed a bid on this project." });
    }

    const bid = await Bid.create({
      projectId,
      studentId: req.user._id,
      amount: Number(amount),
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
      message: `${req.user.name} submitted a bid of ₹${amount} for "${project.title}"`,
      targetId: project._id,
    });

    // Notify client that they received a new bid
    await Notification.create({
      recipientId: project.clientId,
      type: "BID_RECEIVED",
      message: `${req.user.name} placed a bid of ₹${amount} on your project "${project.title}"`,
      targetId: project._id,
    });

    res.status(201).json(bid);
  } catch (error) {
    console.error("Submit bid error:", error);
    res.status(500).json({ message: "Failed to submit bid. Please try again." });
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
      return res.status(404).json({ message: "Project not found." });
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
    console.error("Get bids error:", error);
    res.status(500).json({ message: "Failed to fetch bids. Please try again." });
  }
});

// Helper to generate transaction reference
const genTxnRef = () =>
  "TXN-" +
  Math.random().toString(36).substring(2, 7).toUpperCase() +
  Math.random().toString(36).substring(2, 7).toUpperCase();

// @desc    Accept a bid
// @route   PATCH /api/bids/:id/accept
// @access  Private (Client only)
router.patch("/bids/:id/accept", protect, requireRole("client"), async (req, res) => {
  try {
    const bid = await Bid.findById(req.params.id).populate("studentId", "name");
    if (!bid) {
      return res.status(404).json({ message: "Bid not found." });
    }

    const project = await Project.findById(bid.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Verify ownership
    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to accept bids for this project." });
    }

    if (project.status !== "OPEN") {
      return res.status(400).json({ message: "A bid has already been accepted for this project." });
    }

    // Accept this bid
    bid.status = "ACCEPTED";
    await bid.save();

    // Reject all other bids for this project
    const rejectedBids = await Bid.find({
      projectId: project._id,
      _id: { $ne: bid._id },
    }).select("studentId");

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
      const numAmount = parseFloat(String(milestone.amount).replace(/[^0-9.]/g, "")) || 0;

      await PaymentLedger.create({
        projectId: project._id,
        milestoneId: milestone._id,
        clientId: project.clientId,
        studentId: bid.studentId._id || bid.studentId,
        amount: numAmount,
        status: "LOCKED",
        transactionRef: genTxnRef(),
      });
    }

    // Log Activity
    await Activity.create({
      actorId: req.user._id,
      type: "BID_ACCEPTED",
      message: `${req.user.name} accepted a bid for "${project.title}"`,
      targetId: project._id,
    });

    // Notify the accepted student
    await Notification.create({
      recipientId: bid.studentId._id || bid.studentId,
      type: "BID_ACCEPTED",
      message: `Your bid was accepted! You've been assigned to "${project.title}". Milestones are now locked in escrow.`,
      targetId: project._id,
    });

    // Notify rejected students
    for (const rejectedBid of rejectedBids) {
      await Notification.create({
        recipientId: rejectedBid.studentId,
        type: "BID_REJECTED",
        message: `Your bid on "${project.title}" was not selected this time. Keep bidding!`,
        targetId: project._id,
      });
    }

    res.json({ message: "Bid accepted. Milestone payments are now locked in escrow.", bid, project });
  } catch (error) {
    console.error("Accept bid error:", error);
    res.status(500).json({ message: "Failed to accept bid. Please try again." });
  }
});

// @desc    Reject a bid
// @route   PATCH /api/bids/:id/reject
// @access  Private (Client only)
router.patch("/bids/:id/reject", protect, requireRole("client"), async (req, res) => {
  try {
    const bid = await Bid.findById(req.params.id);
    if (!bid) {
      return res.status(404).json({ message: "Bid not found." });
    }

    const project = await Project.findById(bid.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to reject bids for this project." });
    }

    bid.status = "REJECTED";
    await bid.save();

    // Notify rejected student
    await Notification.create({
      recipientId: bid.studentId,
      type: "BID_REJECTED",
      message: `Your bid on "${project.title}" was not selected. Keep going!`,
      targetId: project._id,
    });

    res.json({ message: "Bid rejected.", bid });
  } catch (error) {
    console.error("Reject bid error:", error);
    res.status(500).json({ message: "Failed to reject bid. Please try again." });
  }
});

export default router;

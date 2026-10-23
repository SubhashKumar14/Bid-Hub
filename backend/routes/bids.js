import mongoose from "mongoose";
import { allocateOffer } from "../lib/offer.js";
import { Contract } from "../models/Contract.js";
import { httpErrorStatus } from "../lib/validation.js";
import express from "express";
import { createRouter } from "../lib/router.js";
import { Bid } from "../models/Bid.js";
import { Project } from "../models/Project.js";
import { Milestone } from "../models/Milestone.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { Activity } from "../models/Activity.js";
import { Notification } from "../models/Notification.js";
import { protect, requireRole } from "../middleware/auth.js";
import { amountToPaise } from "../lib/validation.js";

const router = createRouter({ mergeParams: true });

// @desc    Submit a bid on a project
// @route   POST /api/projects/:id/bids
// @access  Private (Student only)
router.post("/projects/:id/bids", protect, requireRole("student"), async (req, res) => {
  const { amount, timeline, proposal } = req.body;
  const projectId = req.params.id;
  if (typeof timeline !== "string" || !timeline.trim() || timeline.length > 200 || typeof proposal !== "string" || !proposal.trim() || proposal.length > 10000) return res.status(400).json({ message: "A bounded timeline and proposal are required." });

  if (!amount || !timeline || !proposal) {
    return res.status(400).json({ message: "Please fill in all fields: bid amount, timeline, and proposal." });
  }

  try { amountToPaise(amount); } catch {
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
      if (Number(existingBid.amount) !== Number(amount) || existingBid.timeline !== timeline || existingBid.proposal !== proposal) return res.status(409).json({ message: "Revise the existing proposal instead of submitting another." });
      return res.status(200).json(existingBid);
    }

    const bid = await mongoose.connection.transaction(async session => {
    const project = await Project.findOne({ _id: projectId, status: "OPEN" }).session(session);
    if (!project) throw Object.assign(new Error("Project is no longer open."), { status: 409 });
    const [bid] = await Bid.create([{
      projectId,
      studentId: req.user._id,
      amount: Number(amount),
      timeline,
      proposal,
      schedule: allocateOffer(amount, await Milestone.find({ projectId }).session(session)),
    }], { session });

    // Increment bid count in project
    project.bidsCount = (project.bidsCount || 0) + 1;
    await project.save({ session });

    // Log Activity
    await Activity.create([{
      actorId: req.user._id,
      type: "BID_PLACED",
      message: `${req.user.name} submitted a bid of ₹${amount} for "${project.title}"`,
      targetId: project._id,
    }], { session });

    // Notify client that they received a new bid
    await Notification.create([{
      recipientId: project.clientId,
      type: "BID_RECEIVED",
      message: `${req.user.name} placed a bid of ₹${amount} on your project "${project.title}"`,
      targetId: project._id,
    }], { session });

      return bid;
    });
    res.status(201).json(bid);
  } catch (error) {
    console.error("Submit bid error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to submit bid. Please try again." });
  }
});

router.patch("/bids/:id", protect, requireRole("student"), async (req, res) => {
  const result = await mongoose.connection.transaction(async session => {
    const bid = await Bid.findOne({ _id: req.params.id, studentId: req.user._id, status: "PENDING" }).session(session);
    if (!bid || await Contract.exists({ projectId: bid.projectId }).session(session)) throw Object.assign(new Error("Agreed offers cannot be changed."), { status: 409 });
    const project = await Project.findOne({ _id: bid.projectId, status: "OPEN" }).session(session);
    if (!project) throw Object.assign(new Error("Project is no longer open."), { status: 409 });
    if (req.body.action === "WITHDRAW") bid.status = "WITHDRAWN";
    else if (req.body.action === "REVISE") {
      amountToPaise(req.body.amount);
      if (typeof req.body.timeline !== "string" || !req.body.timeline.trim() || req.body.timeline.length > 200 || typeof req.body.proposal !== "string" || !req.body.proposal.trim() || req.body.proposal.length > 10000) throw Object.assign(new Error("Bounded timeline and proposal are required."), { status: 400 });
      bid.history.push({ version: bid.version, amount: bid.amount, timeline: bid.timeline, proposal: bid.proposal, schedule: bid.schedule.toObject() });
      bid.version++; bid.amount = req.body.amount; bid.timeline = req.body.timeline; bid.proposal = req.body.proposal;
      bid.schedule = allocateOffer(bid.amount, await Milestone.find({ projectId: bid.projectId }).session(session));
    } else throw Object.assign(new Error("Specify REVISE or WITHDRAW."), { status: 400 });
    project.updatedAt = new Date();
    project.markModified("updatedAt");
    await project.save({ session });
    await bid.save({ session }); return bid;
  });
  res.json(result);
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
    res.status(httpErrorStatus(error)).json({ message: "Failed to fetch bids. Please try again." });
  }
});

// Helper to generate transaction reference
const genTxnRef = () =>
  "TXN-" +
  Math.random().toString(36).substring(2, 7).toUpperCase() +
  Math.random().toString(36).substring(2, 7).toUpperCase();

// @desc    Accept a bid (Disabled: use /api/payments/checkout-session)
// @route   PATCH /api/bids/:id/accept
// @access  Private (Client only)
router.patch("/bids/:id/accept", protect, requireRole("client"), async (req, res) => {
  return res.status(400).json({
    message: "Use checkout-session with the bid ID and exact proposal version to agree and confirm test funding.",
  });
});

// @desc    Reject a bid
// @route   PATCH /api/bids/:id/reject
// @access  Private (Client only)
router.patch("/bids/:id/reject", protect, requireRole("client"), async (req, res) => {
  try {
    const bid = await mongoose.connection.transaction(async session => {
      const bid = await Bid.findById(req.params.id).session(session);
      if (!bid) throw Object.assign(new Error("Bid not found."), {status:404});
      const project = await Project.findOne({ _id: bid.projectId, clientId: req.user._id }).session(session);
      if (!project) throw Object.assign(new Error("Owned project required."), {status:403});
      if (bid.status === "REJECTED") return bid;
      if (project.status !== "OPEN" || bid.status !== "PENDING") throw Object.assign(new Error("Only pending offers on open projects may be rejected."), {status:409});
      bid.status = "REJECTED";
      await bid.save({session});
      await Notification.create([{ recipientId: bid.studentId, type: "BID_REJECTED", message: `Your proposal on "${project.title}" was not selected.`, targetId: project._id }], {session});
      return bid;
    });
    res.json({ message: "Bid rejected.", bid });
  } catch (error) {
    console.error("Reject bid error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to reject bid. Please try again." });
  }
});

export default router;

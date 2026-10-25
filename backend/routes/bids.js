import mongoose from "mongoose";
import { offerSchedule, offerTerms } from "../lib/offer.js";
import { createCounteroffer, decideCounteroffer, supersedeCounteroffers, validRequestId, validateProposalText } from "../services/negotiation.js";
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
  const { amount, timeline, proposal, schedule: inputSchedule } = req.body;
  const projectId = req.params.id;
  if (typeof timeline !== "string" || !timeline.trim() || timeline.length > 200 || typeof proposal !== "string" || !proposal.trim() || proposal.length > 10000) return res.status(400).json({ message: "Add a timeline (up to 200 characters) and describe your approach (up to 10,000 characters)." });

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

    if (project.status !== "OPEN" || project.recoveryPending || project.sampleData) {
      return res.status(400).json({ message: "This project is no longer accepting bids." });
    }
    if (project.deadline <= new Date().toISOString().slice(0, 10)) return res.status(409).json({ message: "This project's delivery date has passed. Ask the client for an updated project before sending a proposal." });

    // Prevent a client from bidding on their own project
    if (project.clientId.toString() === req.user._id.toString()) {
      return res.status(403).json({ message: "You cannot bid on your own project." });
    }

    // Check if student already bid
    const milestones = await Milestone.find({ projectId });
    const schedule = offerSchedule(amount, milestones, inputSchedule, project.deadline);
    const existingBid = await Bid.findOne({ projectId, studentId: req.user._id });
    if (existingBid) {
      const existingSchedule = existingBid.schedule?.length ? existingBid.schedule : offerSchedule(existingBid.amount, milestones, undefined, project.deadline);
      if (offerTerms(existingBid.amount, existingBid.timeline, existingBid.proposal, existingSchedule) !== offerTerms(amount, timeline, proposal, schedule)) return res.status(409).json({ message: "You already sent a proposal. Open it and choose Revise proposal to change your terms." });
      return res.status(200).json(existingBid);
    }

    const bid = await mongoose.connection.transaction(async session => {
    const project = await Project.findOne({ _id: projectId, status: "OPEN" }).session(session);
    if (!project || project.recoveryPending || project.sampleData) throw Object.assign(new Error("This project is no longer accepting proposals."), { status: 409 });
    const [bid] = await Bid.create([{
      projectId,
      studentId: req.user._id,
      amount: Number(amount),
      timeline,
      proposal,
      schedule: offerSchedule(amount, await Milestone.find({ projectId }).session(session), inputSchedule, project.deadline),
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
    res.status(httpErrorStatus(error)).json({ message: error.status < 500 ? error.message : "Your proposal could not be saved. Your draft is still here; try again." });
  }
});

router.patch("/bids/:id", protect, requireRole("student"), async (req, res) => {
  const result = await mongoose.connection.transaction(async session => {
    const bid = await Bid.findOne({ _id: req.params.id, studentId: req.user._id }).session(session);
    if (!bid) throw Object.assign(new Error("Your proposal was not found."), { status: 404 });
    if (req.body.action === "WITHDRAW" && bid.status === "WITHDRAWN" && req.body.proposalVersion === bid.version) return bid;
    const milestones = await Milestone.find({ projectId: bid.projectId }).session(session);
    let schedule;
    if (req.body.action === "REVISE") {
      validateProposalText(req.body.timeline, req.body.proposal);
      if (!validRequestId(req.body.requestId)) throw Object.assign(new Error("Reload your proposal before saving this revision."), { status: 400 });
      const currentProject = await Project.findById(bid.projectId).session(session);
      schedule = offerSchedule(req.body.amount, milestones, req.body.schedule, currentProject?.deadline);
      if (bid.revisionRequestId === req.body.requestId) {
        if (req.body.proposalVersion === bid.version - 1 && offerTerms(bid.amount, bid.timeline, bid.proposal, bid.schedule) === offerTerms(req.body.amount, req.body.timeline, req.body.proposal, schedule)) return bid;
        throw Object.assign(new Error("This revision reference belongs to different terms. Reload and review your saved proposal."), { status: 409 });
      }
    }
    if (bid.status !== "PENDING" || await Contract.exists({ projectId: bid.projectId }).session(session)) throw Object.assign(new Error("This proposal is closed. Agreed terms cannot be edited."), { status: 409 });
    if (!Number.isSafeInteger(req.body.proposalVersion) || req.body.proposalVersion !== bid.version) throw Object.assign(new Error("Your proposal changed in another tab. Reload it before saving."), { status: 409 });
    const project = await Project.findOne({ _id: bid.projectId, status: "OPEN" }).session(session);
    if (!project || project.sampleData || project.recoveryPending) throw Object.assign(new Error("This project is no longer open for proposal changes."), { status: 409 });
    if (project.deadline <= new Date().toISOString().slice(0, 10)) throw Object.assign(new Error("This project's delivery date has passed. Ask the client for an updated project before revising your proposal."), { status: 409 });
    if (req.body.action === "WITHDRAW") bid.status = "WITHDRAWN";
    else if (req.body.action === "REVISE") {
      bid.history.push({ version: bid.version, amount: bid.amount, timeline: bid.timeline, proposal: bid.proposal, schedule: bid.schedule.toObject() });
      bid.version++; bid.amount = req.body.amount; bid.timeline = req.body.timeline; bid.proposal = req.body.proposal;
      bid.schedule = schedule; bid.revisionRequestId = req.body.requestId;
    } else throw Object.assign(new Error("Specify REVISE or WITHDRAW."), { status: 400 });
    supersedeCounteroffers(bid);
    project.updatedAt = new Date();
    project.markModified("updatedAt");
    await project.save({ session });
    await bid.save({ session });
    await Notification.create([{ recipientId: project.clientId, type: "COUNTEROFFER_UPDATED", message: `The student ${bid.status === "WITHDRAWN" ? "withdrew" : "revised"} their proposal for "${project.title}".`, targetId: project._id }], { session });
    return bid;
  });
  res.json(result);
});

router.post("/bids/:id/counteroffers", protect, requireRole("client"), async (req, res) => {
  const result = await createCounteroffer(req.params.id, req.user._id, req.body);
  res.status(result.replayed ? 200 : 201).json(result);
});

router.patch("/bids/:id/counteroffers/:counterofferId", protect, async (req, res) => {
  res.json(await decideCounteroffer(req.params.id, req.params.counterofferId, req.user, req.body));
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
        "name avatarUrl college skills"
      );
    } else {
      // Students can only see their own bid
      bids = await Bid.find({ projectId, studentId: req.user._id }).populate(
        "studentId",
        "name avatarUrl college skills"
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
      supersedeCounteroffers(bid);
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

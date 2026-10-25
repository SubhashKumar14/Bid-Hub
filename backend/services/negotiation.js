import mongoose from "mongoose";
import { Bid } from "../models/Bid.js";
import { Project } from "../models/Project.js";
import { Milestone } from "../models/Milestone.js";
import { Contract } from "../models/Contract.js";
import { Notification } from "../models/Notification.js";
import { offerSchedule, offerTerms } from "../lib/offer.js";
import { freezeAgreement } from "../payments/agreement.js";

const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
export const validRequestId = value => typeof value === "string" && /^[\w-]{8,100}$/.test(value);
export function validateProposalText(timeline, proposal) {
  if (typeof timeline !== "string" || !timeline.trim() || timeline.length > 200 || typeof proposal !== "string" || !proposal.trim() || proposal.length > 10000) fail("Add a timeline (up to 200 characters) and describe the work you will deliver (up to 10,000 characters).", 400);
}
export function supersedeCounteroffers(bid) {
  for (const offer of bid.counteroffers || []) if (offer.status === "PENDING") { offer.status = "SUPERSEDED"; offer.decidedAt = new Date(); }
}
async function editableProject(bid, session) {
  const project = await Project.findById(bid.projectId).session(session);
  if (!project || project.status !== "OPEN" || project.recoveryPending || bid.status !== "PENDING" || await Contract.exists({ projectId: bid.projectId }).session(session)) fail("Terms are closed for this project. Open the saved agreement to see what was agreed.");
  if (project.sampleData) fail("This is a sample project. Post a project of your own to try negotiation.");
  if (project.deadline <= new Date().toISOString().slice(0, 10)) fail("This project's delivery date has passed. Ask the client to post a new brief with a future date.");
  return project;
}

export async function createCounteroffer(bidId, clientId, input) {
  validateProposalText(input.timeline, input.proposal);
  if (!validRequestId(input.requestId) || !Number.isSafeInteger(input.proposalVersion) || input.proposalVersion < 1 || !Number.isSafeInteger(input.previousCounterofferVersion) || input.previousCounterofferVersion < 0 || (input.message !== undefined && (typeof input.message !== "string" || input.message.length > 2000))) fail("Reload the proposal and send your counteroffer again. A version and request reference are required.", 400);
  return mongoose.connection.transaction(async session => {
    const bid = await Bid.findById(bidId).session(session);
    if (!bid) fail("Proposal not found.", 404);
    const project = await Project.findById(bid.projectId).session(session);
    if (!project || String(project.clientId) !== String(clientId)) fail("Only the client who posted this project can send a counteroffer.", 403);
    const schedule = offerSchedule(input.amount, await Milestone.find({ projectId: bid.projectId }).session(session), input.schedule, project.deadline);
    const prior = bid.counteroffers.find(offer => offer.requestId === input.requestId);
    if (prior) {
      if (prior.baseProposalVersion !== input.proposalVersion || prior.previousCounterofferVersion !== input.previousCounterofferVersion || (prior.message || "") !== (input.message || "").trim() || offerTerms(prior.amount, prior.timeline, prior.proposal, prior.schedule) !== offerTerms(input.amount, input.timeline.trim(), input.proposal.trim(), schedule)) fail("This request reference belongs to different terms. Reload before sending a new counteroffer.");
      return { bid, counteroffer: prior, replayed: true };
    }
    await editableProject(bid, session);
    if (input.proposalVersion !== bid.version) fail("The student revised this proposal. Reload it before making a counteroffer.");
    if (input.previousCounterofferVersion !== (bid.counteroffers.at(-1)?.version || 0)) fail("A counteroffer was sent from another tab. Reload the latest terms before sending yours.");
    if (bid.counteroffers.length >= 100) fail("This proposal has reached its negotiation limit. Withdraw it and discuss a new project with the student.");
    supersedeCounteroffers(bid);
    bid.counteroffers.push({ version: bid.counteroffers.length + 1, baseProposalVersion: bid.version, previousCounterofferVersion: input.previousCounterofferVersion, requestId: input.requestId, amount: input.amount, timeline: input.timeline.trim(), proposal: input.proposal.trim(), message: (input.message || "").trim(), schedule });
    await bid.save({ session });
    project.updatedAt = new Date(); project.markModified("updatedAt"); await project.save({ session });
    await Notification.create([{ recipientId: bid.studentId, type: "COUNTEROFFER_RECEIVED", message: `The client sent new terms for "${project.title}". Review the price, timeline and milestones before replying.`, targetId: project._id }], { session });
    return { bid, counteroffer: bid.counteroffers.at(-1) };
  });
}

export async function decideCounteroffer(bidId, counterofferId, actor, input) {
  if (!["ACCEPT", "DECLINE", "WITHDRAW"].includes(input.action) || !Number.isSafeInteger(input.proposalVersion) || !Number.isSafeInteger(input.counterofferVersion)) fail("Choose accept, decline or withdraw for the counteroffer you are viewing.", 400);
  return mongoose.connection.transaction(async session => {
    const bid = await Bid.findById(bidId).session(session);
    const offer = bid?.counteroffers.id(counterofferId);
    if (!offer) fail("Counteroffer not found.", 404);
    const project = await Project.findById(bid.projectId).session(session);
    const student = actor.role === "student" && String(actor._id) === String(bid.studentId);
    const owner = actor.role === "client" && String(actor._id) === String(project?.clientId);
    if ((input.action === "WITHDRAW" && !owner) || (input.action !== "WITHDRAW" && !student)) fail("Only the student can accept or decline. Only the project client can withdraw this counteroffer.", 403);
    if (input.proposalVersion !== offer.baseProposalVersion || input.counterofferVersion !== offer.version) fail("These terms have changed. Reload the proposal before replying.");
    const status = { ACCEPT: "ACCEPTED", DECLINE: "DECLINED", WITHDRAW: "WITHDRAWN" }[input.action];
    if (offer.status === status) {
      const contract = input.action === "ACCEPT" ? await Contract.findOne({ projectId: bid.projectId, counterofferId: offer._id }).session(session) : undefined;
      if (input.action === "ACCEPT" && !contract) fail("The accepted terms need an operator review. No new agreement was created.");
      return { bid, counteroffer: offer, contract, replayed: true };
    }
    if (offer.status !== "PENDING" || bid.version !== offer.baseProposalVersion) fail("This counteroffer is no longer open. Review the latest terms.");
    await editableProject(bid, session);
    offer.status = status; offer.decidedAt = new Date();
    let contract;
    if (input.action === "ACCEPT") {
      bid.history.push({ version: bid.version, amount: bid.amount, timeline: bid.timeline, proposal: bid.proposal, schedule: bid.schedule.toObject() });
      bid.version++; bid.amount = offer.amount; bid.timeline = offer.timeline; bid.proposal = offer.proposal; bid.schedule = offer.schedule.toObject(); bid.sourceCounterofferId = offer._id;
      contract = await freezeAgreement(bid, project, session, actor._id, offer);
    } else {
      await bid.save({ session });
      project.updatedAt = new Date(); project.markModified("updatedAt"); await project.save({ session });
    }
    await Notification.create([{ recipientId: owner ? bid.studentId : project.clientId, type: "COUNTEROFFER_UPDATED", message: input.action === "ACCEPT" ? `The student accepted your terms for "${project.title}". The agreement is saved and is waiting for test funding.` : `The counteroffer for "${project.title}" was ${status.toLowerCase()}. The original proposal is still available.`, targetId: project._id }], { session });
    return { bid, counteroffer: offer, contract };
  });
}

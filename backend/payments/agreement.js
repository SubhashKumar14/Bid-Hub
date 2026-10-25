import mongoose from "mongoose";
import { Contract } from "../models/Contract.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Milestone } from "../models/Milestone.js";
import { amountToPaise } from "../lib/validation.js";
import { offerSchedule } from "../lib/offer.js";

export async function freezeAgreement(bid, project, session, acceptedBy, counteroffer) {
  if (project.deadline <= new Date().toISOString().slice(0, 10)) throw Object.assign(new Error("This project's delivery date has passed. The client needs to post a new brief with a future date before agreeing terms."), { status: 409 });
  const milestones = await Milestone.find({ projectId: project._id }).session(session);
  const schedule = offerSchedule(bid.amount, milestones, bid.schedule?.length ? bid.schedule : undefined, project.deadline);
  const [contract] = await Contract.create([{
    projectId: project._id, clientId: project.clientId, studentId: bid.studentId, bidId: bid._id,
    proposalVersion: bid.version || 1, acceptedBy, counterofferId: counteroffer?._id, counterofferVersion: counteroffer?.version,
    totalPaise: amountToPaise(bid.amount), timeline: bid.timeline, proposal: bid.proposal, brief: project.description,
    scope: { title: project.title, description: project.description, category: project.category, skillsRequired: project.skillsRequired, deliveryDeadline: project.deadline, remote: project.remote, location: project.location, level: project.level, duration: project.duration, attachments: project.files },
    title: project.title, category: project.category, skillsRequired: project.skillsRequired,
    deliveryDeadline: project.deadline, advertisedBudgetPaise: amountToPaise(project.budget), schedule,
  }], { session });
  bid.agreementLock = (bid.agreementLock || 0) + 1;
  await bid.save({ session });
  await Bid.updateMany({ projectId: project._id, _id: { $ne: bid._id } }, { $set: { "counteroffers.$[offer].status": "SUPERSEDED", "counteroffers.$[offer].decidedAt": new Date() } }, { arrayFilters: [{ "offer.status": "PENDING" }], session });
  for (const row of schedule) await Milestone.updateOne({ _id: row.milestoneId, projectId: project._id }, { amount: row.amountPaise / 100, dueDate: row.dueDate }, { session });
  project.status = "PENDING_FUNDING";
  project.contractTotalPaise = contract.totalPaise;
  await project.save({ session });
  return contract;
}

export async function agreeOffer(bidId, clientId, proposalVersion) {
  return mongoose.connection.transaction(async session => {
    const bid = await Bid.findById(bidId).session(session);
    if (!bid || bid.status !== "PENDING") throw Object.assign(new Error("Pending offer required."), { status: 409 });
    if (proposalVersion !== undefined && proposalVersion !== (bid.version || 1)) throw Object.assign(new Error("The proposal changed. Refresh and review the new terms before accepting."), { status: 409 });
    const project = await Project.findOne({ _id: bid.projectId, clientId, status: { $in: ["OPEN", "PENDING_FUNDING"] } }).session(session);
    if (!project) throw Object.assign(new Error("Eligible owned project required."), { status: 403 });
    const existing = await Contract.findOne({ projectId: project._id }).session(session);
    if (existing) {
      if (String(existing.bidId) !== String(bidId)) throw Object.assign(new Error("A different offer is already agreed."), { status: 409 });
      return existing;
    }
    if (bid.counteroffers?.some(offer => offer.status === "PENDING")) throw Object.assign(new Error("Your counteroffer is waiting for a reply. Withdraw it before accepting the student's original proposal."), { status: 409 });
    return freezeAgreement(bid, project, session, clientId);
  });
}

import mongoose from "mongoose";
import { Contract } from "../models/Contract.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Milestone } from "../models/Milestone.js";
import { amountToPaise } from "../lib/validation.js";
import { allocateOffer } from "../lib/offer.js";
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
    const milestones = await Milestone.find({ projectId: project._id }).session(session);
    const schedule = bid.schedule?.length ? bid.schedule : allocateOffer(bid.amount, milestones);
    if (schedule.length !== milestones.length || schedule.some(a => !Number.isSafeInteger(a.amountPaise) || a.amountPaise <= 0 || !milestones.some(m => String(m._id) === String(a.milestoneId))) || new Set(schedule.map(a=>String(a.milestoneId))).size !== milestones.length || schedule.reduce((s,a)=>s+a.amountPaise,0) !== amountToPaise(bid.amount)) throw Object.assign(new Error("Offer schedule does not match its total."), { status: 400 });
    const [contract] = await Contract.create([{ projectId: project._id, clientId, studentId: bid.studentId, bidId, proposalVersion: bid.version || 1, totalPaise: amountToPaise(bid.amount), timeline: bid.timeline, proposal: bid.proposal, brief: project.description, scope: {title:project.title,description:project.description,category:project.category,skillsRequired:project.skillsRequired,deliveryDeadline:project.deadline,remote:project.remote,location:project.location,level:project.level,duration:project.duration,attachments:project.files}, title: project.title, category: project.category, skillsRequired: project.skillsRequired, deliveryDeadline: project.deadline, advertisedBudgetPaise:amountToPaise(project.budget), schedule }], { session });
    // Serialize agreement with revisions/withdrawals of this exact offer.
    bid.agreementLock = (bid.agreementLock || 0) + 1;
    await bid.save({ session });
    for (const a of schedule) await Milestone.updateOne({ _id: a.milestoneId, projectId: project._id }, { amount: a.amountPaise / 100 }, { session });
    project.status = "PENDING_FUNDING";
    project.contractTotalPaise = contract.totalPaise;
    await project.save({ session });
    return contract;
  });
}

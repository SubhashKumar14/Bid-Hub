import mongoose from "mongoose";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Milestone } from "../models/Milestone.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { Activity } from "../models/Activity.js";
import { Notification } from "../models/Notification.js";
import { amountToPaise } from "../lib/validation.js";

// No gateway requests inside this transaction. Replica-set MongoDB is required.
export async function settlePayment(projectId, bidId, amount, orderId, paymentId) {
  return mongoose.connection.transaction(async session => {
    const deposit = await PaymentLedger.findOne({ stripeSessionId: orderId, milestoneId: null }).session(session);
    if (!deposit) return false;
    if (deposit.status === "LOCKED") return deposit.stripePaymentIntentId === paymentId;
    if (deposit.status !== "PENDING_CHECKOUT" || !deposit.bidId || String(deposit.bidId) !== String(bidId)) return false;
    const total = amountToPaise(amount);
    if (deposit.amountPaise !== total) return false;
    const project = await Project.findOne({ _id: projectId, clientId: deposit.clientId, status: "PENDING_FUNDING" }).session(session);
    const bid = await Bid.findOne({ _id: bidId, projectId, studentId: deposit.studentId, status: "PENDING" }).session(session);
    if (!project || project.recoveryPending || !bid || amountToPaise(bid.amount) !== total) return false;
    const milestones = await Milestone.find({ projectId }).session(session);
    if (!deposit.allocationSchedule?.length || deposit.allocationSchedule.length !== milestones.length ||
      milestones.some(m => !deposit.allocationSchedule.some(a => String(a.milestoneId) === String(m._id) && a.amountPaise === amountToPaise(m.amount)))) return false;
    if (!milestones.length || milestones.reduce((sum, m) => sum + amountToPaise(m.amount), 0) !== total) return false;
    const changed = await Project.updateOne({ _id: projectId, status: "PENDING_FUNDING" }, { status: "ASSIGNED", acceptedBidId: bidId }, { session });
    if (changed.modifiedCount !== 1) throw new Error("Concurrent assignment conflict.");
    const accepted = await Bid.updateOne({ _id: bidId, status: "PENDING" }, { status: "ACCEPTED" }, { session });
    if (accepted.modifiedCount !== 1) throw new Error("Concurrent bid conflict.");
    await Bid.updateMany({ projectId, _id: { $ne: bidId }, status: "PENDING" }, { status: "REJECTED" }, { session });
    deposit.status = "LOCKED";
    deposit.stripePaymentIntentId = paymentId;
    await deposit.save({ session });
    await PaymentLedger.create(milestones.map(m => ({
      projectId, milestoneId: m._id, clientId: deposit.clientId, studentId: deposit.studentId,
      amount: amountToPaise(m.amount) / 100, amountPaise: amountToPaise(m.amount),
      bidId, provider: deposit.provider, status: "LOCKED", stripeSessionId: orderId,
      stripePaymentIntentId: paymentId,
    })), { session, ordered: true });
    await Activity.create([{ actorId: deposit.clientId, type: "BID_ACCEPTED", message: `Funding confirmed for "${project.title}"`, targetId: projectId }], { session });
    await Notification.create([{ recipientId: deposit.studentId, type: "BID_ACCEPTED", message: `Your bid on "${project.title}" was accepted.`, targetId: projectId }], { session });
    return true;
  });
}

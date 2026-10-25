import mongoose from "mongoose";
import { Project } from "../models/Project.js";
import { Contract } from "../models/Contract.js";
import { RecoveryCase } from "../models/RecoveryCase.js";
import { FundingAttempt } from "../models/FundingAttempt.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { PaymentEvent } from "../models/PaymentEvent.js";
const fail = (message, status=409) => { throw Object.assign(new Error(message), {status}); };
export function isOperator(id) { return (process.env.OPERATOR_USER_IDS || "").split(",").map(x=>x.trim()).filter(Boolean).includes(String(id)); }
export async function resolveRecovery(projectId, caseId, actorId, input) {
  if (!isOperator(actorId)) fail("An explicitly configured operator account is required.",403);
  const {action,requestId,expectedVersion,reason}=input;
  if (!["RESUME","RESOLVE"].includes(action) || typeof requestId!=="string" || !/^[\w-]{8,100}$/.test(requestId) || !Number.isSafeInteger(expectedVersion) || expectedVersion<1 || typeof reason!=="string" || reason.trim().length<10 || reason.length>5000) fail("Provide RESUME or RESOLVE, requestId, expectedVersion and an auditable reason of 10 to 5000 characters.",400);
  return mongoose.connection.transaction(async session=>{
    const record=await RecoveryCase.findOne({_id:caseId,projectId}).session(session);
    const project=await Project.findById(projectId).session(session);
    if(!record || !project) fail("Recovery case not found.",404);
    const prior=record.history.find(row=>row.requestId===requestId);
    if(prior) { if(prior.action!==action || prior.reason!==reason.trim() || String(prior.actorId)!==String(actorId)) fail("Resolution identity conflicts with an earlier action."); return {project,recovery:record,replayed:true}; }
    if(record.state!=="OPERATOR_REVIEW" || !project.recoveryPending || (record.version || 1)!==expectedVersion) fail("Case state/version changed. Reload the case before deciding.");
    const contract=await Contract.findOne({projectId}).session(session);
    if(!contract) fail("The retained agreement must be reconciled first.");
    if(await FundingAttempt.exists({contractId:contract._id,state:{$in:["CREATING","RECOVERY_REQUIRED"]}}).session(session)) fail("Funding outcome remains uncertain. Reconcile the provider order before resolution.");
    const deposits=await PaymentLedger.find({projectId,milestoneId:null}).session(session);
    if(await PaymentEvent.exists({orderId:{$in:deposits.map(row=>row.stripeSessionId)},status:{$ne:"PROCESSED"}}).session(session)) fail("Unresolved payment events require reconciliation first.");
    if(!["PENDING_FUNDING","ASSIGNED","IN_PROGRESS"].includes(project.status)) fail("Only paused agreed work can be resolved through this action.");
    if (project.sampleData) fail("Sample projects are read-only and cannot be operator-resumed.");
    if (action === "RESUME" && ["ASSIGNED", "IN_PROGRESS"].includes(project.status)) {
      const deposit = deposits.find(row => row.status === "LOCKED" && row.stripePaymentIntentId && String(row.bidId) === String(contract.bidId) && row.amountPaise === contract.totalPaise);
      const allocations = await PaymentLedger.find({ projectId, milestoneId: { $ne: null } }).session(session);
      const completeSchedule = contract.schedule.length > 0 && allocations.length === contract.schedule.length && contract.schedule.every(item => {
        const row = allocations.find(candidate => String(candidate.milestoneId) === String(item.milestoneId));
        return row && row.status === "LOCKED" && row.amountPaise === item.amountPaise && row.amountPaise > 0 && String(row.bidId) === String(contract.bidId);
      });
      const allocatedPaise = allocations.reduce((sum, row) => sum + (Number.isSafeInteger(row.amountPaise) ? row.amountPaise : 0), 0);
      if (!deposit || !completeSchedule || allocatedPaise !== contract.totalPaise) fail("Verified locked test funding and every exact contract allocation are required before work can resume.");
    }
    if(action==="RESOLVE" && deposits.some(row=>row.status==="PENDING_CHECKOUT")) fail("A payable order cannot be cancelled by a work decision. Reconcile it first.");
    const before=project.status;
    project.recoveryPending=false;
    if(action==="RESOLVE") project.status="CANCELLED";
    record.state="RESOLVED"; record.resolution=reason.trim(); record.version=(record.version || 1)+1;
    record.history.push({requestId,action,actorId,reason:reason.trim(),beforeProjectState:before,afterProjectState:project.status,at:new Date()});
    await project.save({session}); await record.save({session});
    return {project,recovery:record};
  });
}

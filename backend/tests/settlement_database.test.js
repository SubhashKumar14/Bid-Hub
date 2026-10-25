import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import crypto from "node:crypto";
import { settlePayment } from "../payments/settle.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Milestone } from "../models/Milestone.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { MilestoneSubmission } from "../models/MilestoneSubmission.js";
import { Notification } from "../models/Notification.js";
import { Contract } from "../models/Contract.js";
import { agreeOffer } from "../payments/agreement.js";
import { allocateOffer } from "../lib/offer.js";
import { offerSchedule } from "../lib/offer.js";
import { createCounteroffer, decideCounteroffer } from "../services/negotiation.js";
import { Message } from "../models/Message.js";
import { Review } from "../models/Review.js";
import { PaymentEvent } from "../models/PaymentEvent.js";
import { FundingAttempt } from "../models/FundingAttempt.js";
import { User } from "../models/User.js";
import { RecoveryCase } from "../models/RecoveryCase.js";
import { resolveRecovery } from "../services/recovery.js";
import { verifiedReviews } from "../services/reputation.js";
process.env.BIDHUB_ISOLATED_TEST="1";
process.env.PRODUCT_MODE = "test";
process.env.PAYMENT_PROVIDER = "mock";
process.env.NODE_ENV = "test";
const { default: milestoneRouter } = await import("../routes/milestones.js");
const { default: bidRouter } = await import("../routes/bids.js");
const { default: messageRouter } = await import("../routes/messages.js");
const { default: reviewRouter } = await import("../routes/reviews.js");

async function invoke(router, path, method, req) {
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle(req, response, error => { throw error; });
  return response;
}

const binary = process.env.MONGOD_BINARY || "C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe";
const available = fs.existsSync(binary);
let child;
let directory;
before(async () => {
  if (process.env.TEST_MONGODB_URI) { await mongoose.connect(process.env.TEST_MONGODB_URI); await Promise.all(Object.values(mongoose.models).map(m => m.init())); return; }
  assert.ok(available, "Required MongoDB executable unavailable. Set MONGOD_BINARY; integration tests must not skip.");
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "bidhub-transaction-test-"));
  child = spawn(binary, ["--dbpath", directory, "--port", "27128", "--bind_ip", "127.0.0.1", "--replSet", "audit", "--oplogSize", "32", "--wiredTigerCacheSizeGB", "0.25"], { windowsHide: true, stdio: "ignore" });
  let admin;
  for (let i = 0; i < 40; i++) {
    try { admin = await new mongoose.mongo.MongoClient("mongodb://127.0.0.1:27128/?directConnection=true", { serverSelectionTimeoutMS: 500 }).connect(); break; }
    catch { await new Promise(r => setTimeout(r, 200)); }
  }
  assert.ok(admin, "Isolated MongoDB must start");
  await admin.db("admin").command({ replSetInitiate: { _id: "audit", members: [{ _id: 0, host: "127.0.0.1:27128" }] } });
  await admin.close();
  await mongoose.connect("mongodb://127.0.0.1:27128/settlement_test?replicaSet=audit", { serverSelectionTimeoutMS: 20000 });
  await Promise.all(Object.values(mongoose.models).map(m => m.init()));
});
after(async () => {
  await mongoose.disconnect();
  if (child) {
    child.kill();
    await new Promise(resolve => child.once("exit", resolve));
  }
  // Keep the isolated database files for troubleshooting; never delete user DBs.
});

async function fixture(options = {}) {
  const clientId = new mongoose.Types.ObjectId(), studentId = new mongoose.Types.ObjectId();
  const project = await Project.create({ clientId, title: "Transaction test", description: "Synthetic fixture", category: "Web", budget: 100, deadline: "2027-01-01", status: "PENDING_FUNDING" });
  const bid = await Bid.create({ projectId: project._id, studentId, amount: "100", timeline: "one week", proposal: "Synthetic proposal", status: "PENDING" });
  const milestone = await Milestone.create({ projectId: project._id, title: "Delivery", amount: 100 });
  const orderId = "order_" + project._id;
  if (!options.noLedger) await PaymentLedger.create({ projectId: project._id, bidId: bid._id, clientId, studentId, amount: 100, amountPaise: 10000, provider: "mock", stripeSessionId: orderId, allocationSchedule: [{ milestoneId: milestone._id, amountPaise: 10000 }] });
  const settle = () => settlePayment(project._id, bid._id, 100, orderId, "pay_" + project._id);
  return { project, bid, milestone, orderId, settle };
}

async function negotiationFixture() {
  const f = await fixture({ noLedger: true });
  await Project.updateOne({ _id: f.project._id }, { status: "OPEN" });
  await Milestone.updateOne({ _id: f.milestone._id }, { amount: 40 });
  const final = await Milestone.create({ projectId: f.project._id, title: "Final handover", amount: 60 });
  const terms = { requestId: crypto.randomUUID(), proposalVersion: 1, previousCounterofferVersion: 0, amount: "75", timeline: "Three weeks", proposal: "First a working draft, then the final handover with one revision.", message: "More of the budget goes to the final work.", schedule: [{ milestoneId: String(f.milestone._id), amount: "10" }, { milestoneId: String(final._id), amount: "65" }] };
  return { ...f, final, terms, student: { _id: f.bid.studentId, role: "student" }, client: { _id: f.project.clientId, role: "client" } };
}

test("custom allocations reject missing, duplicate, foreign, inexact and past-date terms", async () => {
  const f = await negotiationFixture();
  const milestones = await Milestone.find({ projectId: f.project._id });
  const valid = offerSchedule("75", milestones, f.terms.schedule, "2027-01-01");
  assert.deepEqual(valid.map(row => row.amountPaise), [1000, 6500]);
  for (const schedule of [f.terms.schedule.slice(0,1), [f.terms.schedule[0], f.terms.schedule[0]], [{...f.terms.schedule[0],milestoneId:String(new mongoose.Types.ObjectId())},f.terms.schedule[1]], [{...f.terms.schedule[0],amount:"10.001"},f.terms.schedule[1]], [{...f.terms.schedule[0],amount:"11"},f.terms.schedule[1]], [{...f.terms.schedule[0],dueDate:"2020-01-01"},f.terms.schedule[1]]]) assert.throws(() => offerSchedule("75", milestones, schedule, "2027-01-01"));
  await Project.updateOne({_id:f.project._id},{deadline:"2020-01-01"});
  await assert.rejects(createCounteroffer(f.bid._id,f.client._id,f.terms),/delivery date has passed/);
});

test("proposal revision preserves custom allocations, retries once and rejects stale edits", async () => {
  const f = await negotiationFixture();
  const req = { params: {id:String(f.bid._id)}, user:f.student, body:{...f.terms,action:"REVISE"} };
  const revised = await invoke(bidRouter, "/bids/:id", "patch", req);
  assert.equal(revised.statusCode,200); assert.equal(revised.body.version,2);
  const replay = await invoke(bidRouter, "/bids/:id", "patch", req);
  assert.equal(replay.body.version,2); assert.equal(replay.body.history.length,1);
  await assert.rejects(invoke(bidRouter, "/bids/:id", "patch", {...req,body:{...req.body,requestId:crypto.randomUUID()}}), /another tab/);
  const agreement = await agreeOffer(f.bid._id, f.project.clientId, 2);
  assert.deepEqual(agreement.schedule.map(row => row.amountPaise),[1000,6500]);
});

test("counteroffer agreement is participant-only, exact, immutable and funds custom allocations once", async () => {
  const f = await negotiationFixture();
  await assert.rejects(createCounteroffer(f.bid._id,new mongoose.Types.ObjectId(),f.terms), error=>error.status===403);
  const created = await createCounteroffer(f.bid._id,f.project.clientId,f.terms);
  assert.equal((await createCounteroffer(f.bid._id,f.project.clientId,f.terms)).replayed,true);
  await assert.rejects(createCounteroffer(f.bid._id,f.project.clientId,{...f.terms,timeline:"Four weeks"}),/different terms/);
  await assert.rejects(createCounteroffer(f.bid._id,f.project.clientId,{...f.terms,amount:"76"}),/add up|different terms/);
  await assert.rejects(agreeOffer(f.bid._id,f.project.clientId,1),/waiting for a reply/);
  const input={action:"ACCEPT",proposalVersion:1,counterofferVersion:1};
  await assert.rejects(decideCounteroffer(f.bid._id,created.counteroffer._id,f.client,input),error=>error.status===403);
  await assert.rejects(decideCounteroffer(f.bid._id,created.counteroffer._id,{_id:new mongoose.Types.ObjectId(),role:"student"},input),error=>error.status===403);
  const accepted=await Promise.all([decideCounteroffer(f.bid._id,created.counteroffer._id,f.student,input),decideCounteroffer(f.bid._id,created.counteroffer._id,f.student,input)]);
  assert.equal(accepted[0].contract.totalPaise,7500); assert.equal(accepted[1].contract.totalPaise,7500);
  assert.equal(await Contract.countDocuments({projectId:f.project._id}),1);
  const bid=await Bid.findById(f.bid._id); assert.equal(bid.version,2); assert.equal(bid.history.length,1);
  const contract=await Contract.findOne({projectId:f.project._id}); assert.equal(String(contract.acceptedBy),String(f.student._id)); assert.equal(String(contract.counterofferId),String(created.counteroffer._id));
  await Contract.updateOne({_id:contract._id},{$set:{counterofferVersion:99,totalPaise:10000,"schedule.0.amountPaise":2000}});
  assert.equal((await Contract.findById(contract._id)).totalPaise,7500);
  assert.equal((await Project.findById(f.project._id)).status,"PENDING_FUNDING"); assert.equal(await PaymentLedger.countDocuments({projectId:f.project._id}),0);
  await PaymentLedger.create({projectId:f.project._id,bidId:f.bid._id,clientId:f.client._id,studentId:f.student._id,amount:75,amountPaise:7500,provider:"mock",stripeSessionId:f.orderId,allocationSchedule:contract.schedule.map(row=>({milestoneId:row.milestoneId,amountPaise:row.amountPaise}))});
  const settle=()=>settlePayment(f.project._id,f.bid._id,75,f.orderId,"pay_custom_"+f.project._id);
  assert.deepEqual(await Promise.all([settle(),settle()]),[true,true]);
  const allocations=await PaymentLedger.find({projectId:f.project._id,milestoneId:{$ne:null}}).sort({amountPaise:1}); assert.deepEqual(allocations.map(row=>row.amountPaise),[1000,6500]);
});

test("decline, withdrawal and superseded counteroffers retain history and cannot be accepted", async () => {
  const f=await negotiationFixture();
  const first=await createCounteroffer(f.bid._id,f.client._id,f.terms);
  const decline={action:"DECLINE",proposalVersion:1,counterofferVersion:1};
  await decideCounteroffer(f.bid._id,first.counteroffer._id,f.student,decline);
  assert.equal((await decideCounteroffer(f.bid._id,first.counteroffer._id,f.student,decline)).replayed,true);
  await assert.rejects(decideCounteroffer(f.bid._id,first.counteroffer._id,f.student,{...decline,action:"ACCEPT"}),/no longer open/);
  await assert.rejects(createCounteroffer(f.bid._id,f.client._id,{...f.terms,requestId:crypto.randomUUID()}),/another tab/);
  const second=await createCounteroffer(f.bid._id,f.client._id,{...f.terms,previousCounterofferVersion:1,requestId:crypto.randomUUID()});
  await decideCounteroffer(f.bid._id,second.counteroffer._id,f.client,{action:"WITHDRAW",proposalVersion:1,counterofferVersion:2});
  const third=await createCounteroffer(f.bid._id,f.client._id,{...f.terms,previousCounterofferVersion:2,requestId:crypto.randomUUID()});
  await invoke(bidRouter,"/bids/:id","patch",{params:{id:String(f.bid._id)},user:f.student,body:{...f.terms,requestId:crypto.randomUUID(),action:"REVISE"}});
  await assert.rejects(decideCounteroffer(f.bid._id,third.counteroffer._id,f.student,{action:"ACCEPT",proposalVersion:1,counterofferVersion:3}),/no longer open/);
  assert.deepEqual((await Bid.findById(f.bid._id)).counteroffers.map(row=>row.status),["DECLINED","WITHDRAWN","SUPERSEDED"]);
});

test("counteroffer acceptance rolls back on notification failure and competing acceptances create one contract", async t => {
  const f=await negotiationFixture();
  const created=await createCounteroffer(f.bid._id,f.client._id,f.terms);
  const input={action:"ACCEPT",proposalVersion:1,counterofferVersion:1};
  const failure=t.mock.method(Notification,"create",async()=>{throw new Error("Injected counteroffer notification failure");});
  await assert.rejects(decideCounteroffer(f.bid._id,created.counteroffer._id,f.student,input),/Injected/); failure.mock.restore();
  assert.equal(await Contract.countDocuments({projectId:f.project._id}),0); assert.equal((await Bid.findById(f.bid._id)).counteroffers[0].status,"PENDING"); assert.equal((await Project.findById(f.project._id)).status,"OPEN");
  const other=await Bid.create({projectId:f.project._id,studentId:new mongoose.Types.ObjectId(),amount:"100",timeline:"One month",proposal:"A different student's proposal"});
  const competing=await createCounteroffer(other._id,f.client._id,{...f.terms,requestId:crypto.randomUUID()});
  const outcomes=await Promise.allSettled([decideCounteroffer(f.bid._id,created.counteroffer._id,f.student,input),decideCounteroffer(other._id,competing.counteroffer._id,{_id:other.studentId,role:"student"},input)]);
  assert.equal(outcomes.filter(row=>row.status==="fulfilled").length,1); assert.equal(await Contract.countDocuments({projectId:f.project._id}),1);
});

test("settlement rolls back assignment on injected allocation failure and retry succeeds", {}, async t => {
  const f = await fixture();
  const original = PaymentLedger.create;
  const replacement = t.mock.method(PaymentLedger, "create", async () => { throw new Error("Injected allocation failure"); });
  await assert.rejects(f.settle(), /Injected/);
  replacement.mock.restore();
  assert.equal((await Project.findById(f.project._id)).status, "PENDING_FUNDING");
  assert.equal((await Bid.findById(f.bid._id)).status, "PENDING");
  assert.equal((await PaymentLedger.findOne({ stripeSessionId: f.orderId })).status, "PENDING_CHECKOUT");
  assert.equal(await f.settle(), true);
  assert.equal(await f.settle(), true);
  assert.equal(await PaymentLedger.countDocuments({ stripeSessionId: f.orderId }), 2);
});

test("real two-milestone settlement creates ordered allocations once", {}, async () => {
 const f = await fixture();
 await Milestone.updateOne({ _id: f.milestone._id }, { amount: 10 });
 const second = await Milestone.create({ projectId: f.project._id, title: "Final delivery", amount: 90 });
 await PaymentLedger.updateOne({ stripeSessionId: f.orderId }, { allocationSchedule: [{ milestoneId: f.milestone._id, amountPaise: 1000 }, { milestoneId: second._id, amountPaise: 9000 }] });
 assert.deepEqual(await Promise.all([f.settle(), f.settle()]), [true, true]);
 const allocations = await PaymentLedger.find({ stripeSessionId: f.orderId, milestoneId: { $ne: null } });
 assert.equal(allocations.length, 2); assert.equal(allocations.reduce((n,a)=>n+a.amountPaise,0),10000);
});

test("parallel settlement produces one assignment and allocation set", {}, async () => {
  const f = await fixture();
  assert.deepEqual(await Promise.all([f.settle(), f.settle(), f.settle()]), [true, true, true]);
  assert.equal(await PaymentLedger.countDocuments({ stripeSessionId: f.orderId, milestoneId: { $ne: null } }), 1);
});

test("failure after financial writes rolls back allocations, survives restart and retries once", {}, async t => {
  const f = await fixture();
  const failure = t.mock.method(Notification, "create", async () => { throw new Error("Injected final notification failure"); });
  await assert.rejects(f.settle(), /Injected/);
  failure.mock.restore();
  assert.equal(await PaymentLedger.countDocuments({ stripeSessionId: f.orderId, milestoneId: { $ne: null } }), 0);
  assert.equal((await Project.findById(f.project._id)).status, "PENDING_FUNDING");
  await mongoose.disconnect();
  await mongoose.connect(process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27128/settlement_test?replicaSet=audit");
  assert.equal(await f.settle(), true);
  assert.equal(await f.settle(), true);
  assert.equal(await PaymentLedger.countDocuments({ stripeSessionId: f.orderId, milestoneId: { $ne: null } }), 1);
});

test("agreement freezes the offered version, exact schedule and agreed total", {}, async () => {
  const f = await fixture();
  await Project.updateOne({ _id: f.project._id }, { status: "OPEN" });
  await Bid.updateOne({ _id: f.bid._id }, { version: 2, amount: "75" });
  await assert.rejects(agreeOffer(f.bid._id, f.project.clientId, 1), /proposal changed/);
  assert.equal(await Contract.countDocuments({ projectId: f.project._id }), 0);
  const outcomes = await Promise.allSettled([agreeOffer(f.bid._id, f.project.clientId, 2), agreeOffer(f.bid._id, f.project.clientId, 2)]);
  assert.ok(outcomes.some(o => o.status === "fulfilled"));
  assert.equal(await Contract.countDocuments({ projectId: f.project._id }), 1);
  const contract = await Contract.findOne({ projectId: f.project._id });
  assert.equal(contract.totalPaise, 7500); assert.equal(contract.advertisedBudgetPaise,10000); assert.equal(contract.proposalVersion, 2);
  assert.equal(contract.scope.title,"Transaction test"); assert.equal(contract.scope.description,"Synthetic fixture");
  contract.totalPaise = 9000; await contract.save();
  assert.equal((await Contract.findById(contract._id)).totalPaise, 7500);
  contract.schedule[0].amountPaise = 9000; await contract.save();
  assert.equal((await Contract.findById(contract._id)).schedule[0].amountPaise, 7500);
  await Contract.updateOne({ _id: contract._id }, { $set: { "schedule.0.amountPaise": 10000, "schedule.0.title": "Changed scope" } });
  assert.equal((await Contract.findById(contract._id)).schedule[0].amountPaise, 7500);
  assert.equal((await Contract.findById(contract._id)).schedule[0].title, "Delivery");
  assert.equal((await Milestone.findById(f.milestone._id)).amount, 75);
  assert.equal((await Project.findById(f.project._id)).budget, 100);
});

test("offer rounding preserves positive paise and exact totals", () => {
  assert.deepEqual(allocateOffer("800", [{ _id: "a", title: "Small", amount: 100 }, { _id: "b", title: "Large", amount: 900 }]).map(m=>m.amountPaise), [8000,72000]);
  const schedule = allocateOffer("0.03", [{ amount: 99999 }, { amount: 1 }, { amount: 1 }]);
  assert.deepEqual(schedule.map(m=>m.amountPaise), [1,1,1]);
});

test("bid, message and review notification failure cannot commit a misleading primary effect", {}, async t => {
  const f = await fixture(); await f.settle();
  const secondary = t.mock.method(Notification, "create", async () => { throw new Error("Injected secondary failure"); });
  const msgReq = { body: { projectId: String(f.project._id), content: "A persistent participant message.", requestId: "test-message-identity" }, user: { _id: f.bid.studentId, name: "Student" } };
  assert.equal((await invoke(messageRouter, "/", "post", msgReq)).statusCode, 500);
  assert.equal(await Message.countDocuments({ projectId: f.project._id }), 0);
  await Project.updateOne({ _id: f.project._id }, { status: "COMPLETED" });
  const reviewReq = { body: { projectId: String(f.project._id), revieweeId: String(f.bid.studentId), rating: 5, comment: "Factual project feedback." }, user: { _id: f.project.clientId, name: "Client" } };
  assert.equal((await invoke(reviewRouter, "/", "post", reviewReq)).statusCode, 500);
  assert.equal(await Review.countDocuments({ projectId: f.project._id }), 0);
  const other = await fixture(); await Project.updateOne({ _id: other.project._id }, { status: "OPEN" });
  const newStudent = new mongoose.Types.ObjectId();
  const bidReq = { params: { id: String(other.project._id) }, body: { amount: 100, timeline: "one week", proposal: "Exact fixture scope." }, user: { _id: newStudent, name: "Student" } };
  assert.equal((await invoke(bidRouter, "/projects/:id/bids", "post", bidReq)).statusCode, 500);
  assert.equal(await Bid.countDocuments({ projectId: other.project._id, studentId: newStudent }), 0);
  secondary.mock.restore();
  assert.equal((await invoke(bidRouter, "/projects/:id/bids", "post", bidReq)).statusCode, 201);
  const sent = await invoke(messageRouter, "/", "post", msgReq);
  assert.equal(sent.statusCode, 201);
  assert.equal((await invoke(messageRouter, "/", "post", msgReq)).body._id.toString(), sent.body._id.toString());
  assert.equal((await invoke(reviewRouter, "/", "post", reviewReq)).statusCode, 201);
});

test("changed allocation schedule fails closed before assignment", {}, async () => {
  const f = await fixture();
  await Milestone.updateOne({ _id: f.milestone._id }, { amount: 10000 });
  assert.equal(await f.settle(), false);
  assert.equal((await Project.findById(f.project._id)).status, "PENDING_FUNDING");
});

test("lost submission and approval responses recover the committed version without duplicate effects", async () => {
  const f = await fixture(); await f.settle();
  const submit = { params: { id: String(f.milestone._id) }, body: { description: "Evidence retained after a lost HTTP response." }, user: { _id: f.bid.studentId } };
  assert.deepEqual((await Promise.all([invoke(milestoneRouter, "/:id/submit", "patch", submit), invoke(milestoneRouter, "/:id/submit", "patch", submit)])).map(r=>r.statusCode), [200,200]);
  assert.equal((await invoke(milestoneRouter, "/:id/submit", "patch", submit)).statusCode, 200);
  assert.equal(await MilestoneSubmission.countDocuments({ milestoneId: f.milestone._id }), 1);
  const submission = await MilestoneSubmission.findOne({ milestoneId: f.milestone._id });
  const approve = { params: submit.params, body: { status: "APPROVED", submissionId: String(submission._id) }, user: { _id: f.project.clientId } };
  assert.equal((await invoke(milestoneRouter, "/:id/release", "patch", approve)).statusCode, 200);
  assert.equal((await invoke(milestoneRouter, "/:id/release", "patch", approve)).statusCode, 200);
  assert.equal(await Notification.countDocuments({ targetId: f.project._id, type: "MILESTONE_APPROVED" }), 1);
  assert.equal((await Project.findById(f.project._id)).status, "COMPLETED");
});

test("message retry identity cannot recover a different project's content", async () => {
  const first = await fixture(), second = await fixture();
  await Bid.updateOne({ _id: second.bid._id }, { studentId: first.bid.studentId });
  await PaymentLedger.updateOne({ stripeSessionId: second.orderId }, { studentId: first.bid.studentId });
  await first.settle(); await second.settle();
  const req = { body: { projectId: String(first.project._id), content: "First project confidential message.", requestId: crypto.randomUUID() }, user: { _id: first.bid.studentId, name: "Student" } };
  assert.equal((await invoke(messageRouter, "/", "post", req)).statusCode, 201);
  const conflict = await invoke(messageRouter, "/", "post", { ...req, body: { ...req.body, projectId: String(second.project._id) } });
  assert.equal(conflict.statusCode, 409);
  assert.equal(await Message.countDocuments({ projectId: second.project._id }), 0);
});

test("ledger account totals sum integer paise rather than floating point rupees", async () => {
  const f=await fixture();
  for(const amount of [0.1,0.2]) await PaymentLedger.create({ projectId:f.project._id, milestoneId:new mongoose.Types.ObjectId(), clientId:f.project.clientId, studentId:f.bid.studentId, amount, amountPaise:Math.round(amount*100), status:"LOCKED" });
  const {default:payments}=await import("../routes/payments.js");
  const result=await invoke(payments,"/","get",{query:{},user:{_id:f.project.clientId}});
  assert.equal(result.statusCode,200); assert.equal(result.body.stats.lockedAmount,0.3);
});

test("simultaneous final work approvals derive one completed project", {}, async () => {
  const f = await fixture();
  await Milestone.updateOne({ _id: f.milestone._id }, { amount: 10 });
  const final = await Milestone.create({ projectId: f.project._id, title: "Final", amount: 90 });
  await PaymentLedger.updateOne({ stripeSessionId: f.orderId }, { allocationSchedule: [{ milestoneId: f.milestone._id, amountPaise: 1000 }, { milestoneId: final._id, amountPaise: 9000 }] });
  await f.settle();
  const requests=[];
  for (const milestone of [f.milestone, final]) {
    const submission=await MilestoneSubmission.create({ milestoneId: milestone._id, submittedBy: f.bid.studentId, description: "Checkpoint evidence.", version: 1, status: "SUBMITTED" });
    await Milestone.updateOne({ _id: milestone._id }, { status: "SUBMITTED", activeSubmissionId: submission._id });
    await PaymentLedger.updateOne({ milestoneId: milestone._id }, { status: "LOCKED" });
    requests.push({ params: { id: String(milestone._id) }, body: { status: "APPROVED", submissionId: String(submission._id) }, user: { _id: f.project.clientId } });
  }
  const results=await Promise.all(requests.map(req=>invoke(milestoneRouter, "/:id/release", "patch", req)));
  assert.deepEqual(results.map(r=>r.statusCode), [200,200]);
  assert.equal((await Project.findById(f.project._id)).status, "COMPLETED");
  assert.equal(await Milestone.countDocuments({ projectId: f.project._id, status: "APPROVED" }), 2);
});

test("demo release rolls back all financial writes and requires the viewed submission", {}, async t => {
  const f = await fixture();
  await f.settle();
  const deposit = await PaymentLedger.findOne({ stripeSessionId: f.orderId, milestoneId: null });
  const submission = await MilestoneSubmission.create({ milestoneId: f.milestone._id, submittedBy: deposit.studentId, githubUrl: "https://github.com/example/repo", demoUrl: "https://example.com", videoUrl: "https://example.com/video", description: "Synthetic delivery", status: "SUBMITTED" });
  await Milestone.updateOne({ _id: f.milestone._id }, { status: "SUBMITTED", activeSubmissionId: submission._id });
  await PaymentLedger.updateOne({ milestoneId: f.milestone._id }, { status: "LOCKED" });
  const handler = milestoneRouter.stack.find(layer => layer.route?.path === "/:id/release").route.stack.at(-1).handle;
  const invoke = async (submissionId) => {
    const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler({ body: { status: "APPROVED", submissionId }, params: { id: String(f.milestone._id) }, user: { _id: deposit.clientId } }, response, error => { throw error; });
    return response;
  };
  assert.equal((await invoke(String(new mongoose.Types.ObjectId()))).statusCode, 409);
  const save = t.mock.method(PaymentLedger.prototype, "save", async () => { throw new Error("Injected release failure"); });
  assert.equal((await invoke(String(submission._id))).statusCode, 503);
  save.mock.restore();
  assert.equal((await Milestone.findById(f.milestone._id)).status, "SUBMITTED");
  assert.equal((await MilestoneSubmission.findById(submission._id)).status, "SUBMITTED");
  assert.equal((await invoke(String(submission._id))).statusCode, 200);
  const allocation = await PaymentLedger.findOne({ milestoneId: f.milestone._id });
  assert.equal(allocation.status, "LOCKED");
  assert.equal(allocation.stripeTransferId, "");
});

test("test-mode work completion does not assert a financial release or payout", async () => {
  const f=await fixture(); await f.settle();
  const submission=await MilestoneSubmission.create({milestoneId:f.milestone._id,submittedBy:f.bid.studentId,description:"Test-funded checkpoint acceptance evidence.",status:"SUBMITTED"});
  await Milestone.updateOne({_id:f.milestone._id},{status:"SUBMITTED",activeSubmissionId:submission._id});
  await PaymentLedger.updateMany({projectId:f.project._id},{provider:"razorpay"});
  await PaymentLedger.updateOne({milestoneId:f.milestone._id},{status:"LOCKED"});
  process.env.PRODUCT_MODE="test";
  try {
    const result=await invoke(milestoneRouter,"/:id/release","patch",{params:{id:String(f.milestone._id)},body:{status:"APPROVED",submissionId:String(submission._id)},user:{_id:f.project.clientId}});
    assert.equal(result.statusCode,200); assert.equal(result.body.simulated,false);
    assert.equal((await Project.findById(f.project._id)).status,"COMPLETED");
    assert.equal((await Milestone.findById(f.milestone._id)).status,"APPROVED");
    const allocation=await PaymentLedger.findOne({milestoneId:f.milestone._id});
    assert.equal(allocation.status,"LOCKED"); assert.equal(allocation.releasedAt,null); assert.equal(allocation.stripeTransferId,"");
  } finally {process.env.PRODUCT_MODE="test";}
});

test("real verify/webhook handlers converge, reject uncaptured payments and retain cancelled captures", {}, async t => {
  process.env.PRODUCT_MODE = "test";
  process.env.RAZORPAY_KEY_ID = "rzp_test_database_fixture";
  process.env.RAZORPAY_KEY_SECRET = "synthetic-provider-secret";
  process.env.RAZORPAY_WEBHOOK_SECRET = "synthetic-webhook-secret";
  process.env.PAYMENT_PROVIDER = "razorpay";
  const { default: payments } = await import("../routes/payments.js");
  const { getPaymentProvider } = await import("../payments/index.js");
  const provider = getPaymentProvider();
  const f = await fixture();
  const paymentId="pay_"+f.project._id;
  let captured=false;
  // Only the external gateway transport is replaced; signatures, routes,
  // event persistence and every Mongoose transaction run normally.
  t.mock.method(provider.razorpay.payments,"fetch",async()=>({id:paymentId,order_id:f.orderId,status:captured?"captured":"authorized",captured,amount:10000,currency:"INR"}));
  const body={razorpay_order_id:f.orderId,razorpay_payment_id:paymentId,razorpay_signature:crypto.createHmac("sha256",provider.keySecret).update(`${f.orderId}|${paymentId}`).digest("hex")};
  const verify=()=>invoke(payments,"/verify","post",{body,user:{_id:f.project.clientId}});
  assert.equal((await verify()).statusCode,409);
  assert.equal(await PaymentLedger.countDocuments({stripeSessionId:f.orderId,milestoneId:{$ne:null}}),0);
  captured=true;
  const webhook=async fixture=>{
    const id="pay_"+fixture.project._id;
    const payload=Buffer.from(JSON.stringify({event:"order.paid",payload:{order:{entity:{id:fixture.orderId,status:"paid",currency:"INR",amount:10000,amount_paid:10000,notes:{projectId:String(fixture.project._id),bidId:String(fixture.bid._id),clientId:String(fixture.project.clientId),studentId:String(fixture.bid.studentId)}}},payment:{entity:{id,order_id:fixture.orderId,status:"captured",captured:true,currency:"INR",amount:10000}}}}));
    return invoke(payments,"/webhook","post",{body:payload,headers:{"x-razorpay-signature":crypto.createHmac("sha256",provider.webhookSecret).update(payload).digest("hex")}});
  };
  const results=await Promise.all([verify(),webhook(f)]);
  assert.deepEqual(results.map(r=>r.statusCode),[200,200]);
  assert.equal(await PaymentLedger.countDocuments({stripeSessionId:f.orderId,milestoneId:{$ne:null}}),1);
  assert.equal((await PaymentEvent.findOne({paymentId})).status,"PROCESSED");
  const cancelled=await fixture();
  await PaymentLedger.updateOne({stripeSessionId:cancelled.orderId},{status:"FAILED"});
  await Project.updateOne({_id:cancelled.project._id},{status:"OPEN"});
  assert.equal((await webhook(cancelled)).body.outcome,"NEEDS_RECONCILIATION");
  assert.equal((await PaymentEvent.findOne({orderId:cancelled.orderId})).status,"NEEDS_RECONCILIATION");
  assert.equal((await Project.findById(cancelled.project._id)).status,"OPEN");
  const timedOut=await fixture({noLedger:true});
  await User.create({ _id: timedOut.bid.studentId, name: "Synthetic student", email: `${timedOut.bid.studentId}@example.com`, passwordHash: "synthetic-not-a-login-hash", role: "student" });
  await Project.updateOne({_id:timedOut.project._id},{status:"OPEN"});
  const create=t.mock.method(provider.razorpay.orders,"create",async()=>{throw new Error("Gateway response timed out after an uncertain outcome");});
  const checkoutReq={body:{bidId:String(timedOut.bid._id),proposalVersion:1},user:{_id:timedOut.project.clientId}};
  assert.equal((await invoke(payments,"/checkout-session","post",checkoutReq)).statusCode,500);
  const contract=await Contract.findOne({projectId:timedOut.project._id});
  assert.equal((await FundingAttempt.findOne({contractId:contract._id})).state,"RECOVERY_REQUIRED");
  assert.equal((await invoke(payments,"/checkout-session","post",checkoutReq)).statusCode,409);
  assert.equal(create.mock.callCount(),1);
  process.env.PRODUCT_MODE="test";
});

test("additive migration dry run and apply are repeatable on the isolated replica set", async () => {
  const uri=process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27128/settlement_test?replicaSet=audit";
  const models=[Project,Bid,Contract,PaymentLedger,Review,Message,MilestoneSubmission];
  const counts=await Promise.all(models.map(model=>model.countDocuments()));
  const financial=await PaymentLedger.aggregate([{ $group: { _id:null, paise:{$sum:"$amountPaise"} } }]);
  for(const args of [[],["--apply"],["--apply"]]) {
    const result=spawnSync(process.execPath,["scripts/workflow-migration.js",...args],{cwd:new URL("../",import.meta.url),env:{...process.env,MONGODB_URI:uri},encoding:"utf8",windowsHide:true,timeout:15000});
    assert.equal(result.error,undefined); assert.equal(result.status,0,result.stderr || result.stdout);
  }
  assert.deepEqual(await Promise.all(models.map(model=>model.countDocuments())),counts);
  assert.deepEqual(await PaymentLedger.aggregate([{ $group: { _id:null, paise:{$sum:"$amountPaise"} } }]),financial);
});

test("operator recovery is authorized, audited, idempotent and cannot bypass uncertain funding",async()=>{
  const f=await fixture(); await f.settle();
  await Contract.create({projectId:f.project._id,clientId:f.project.clientId,studentId:f.bid.studentId,bidId:f.bid._id,proposalVersion:1,totalPaise:10000,schedule:[{milestoneId:f.milestone._id,title:"Delivery",amountPaise:10000}]});
  await Project.updateOne({_id:f.project._id},{recoveryPending:true});
  const recovery=await RecoveryCase.create({projectId:f.project._id,requestedBy:f.project.clientId,reason:"An auditable participant request."});
  const operator=new mongoose.Types.ObjectId();process.env.OPERATOR_USER_IDS=String(operator);
  const input={action:"RESUME",expectedVersion:1,requestId:crypto.randomUUID(),reason:"Provider records and work history reviewed."};
  await assert.rejects(resolveRecovery(f.project._id,recovery._id,f.project.clientId,input),error=>error.status===403);
  const attempt=await FundingAttempt.create({contractId:(await Contract.findOne({projectId:f.project._id}))._id,state:"RECOVERY_REQUIRED"});
  await assert.rejects(resolveRecovery(f.project._id,recovery._id,operator,input),/uncertain/);
  await FundingAttempt.updateOne({_id:attempt._id},{state:"READY"});
  const resolved=await Promise.all([resolveRecovery(f.project._id,recovery._id,operator,input),resolveRecovery(f.project._id,recovery._id,operator,input)]);
  assert.equal(resolved[0].project.recoveryPending,false);assert.equal(resolved[1].recovery.history.length,1);
  assert.equal((await RecoveryCase.findById(recovery._id)).state,"RESOLVED");
  await assert.rejects(resolveRecovery(f.project._id,recovery._id,operator,{...input,reason:"Different content is not the original decision."}),/conflicts/);
  await Project.updateOne({_id:f.project._id},{recoveryPending:true});
  await RecoveryCase.updateOne({_id:recovery._id},{state:"OPERATOR_REVIEW",version:3});
  const end=await resolveRecovery(f.project._id,recovery._id,operator,{...input,action:"RESOLVE",expectedVersion:3,requestId:crypto.randomUUID()});
  assert.equal(end.project.status,"CANCELLED");assert.equal(end.project.recoveryPending,false);assert.equal(end.recovery.history.length,2);
  assert.equal((await PaymentLedger.findOne({milestoneId:f.milestone._id})).status,"LOCKED");
  delete process.env.OPERATOR_USER_IDS;
});

test("reputation excludes invented, nonparticipant and sample reviews",async()=>{
  const f=await fixture();await f.settle();await Project.updateOne({_id:f.project._id},{status:"COMPLETED"});await Milestone.updateOne({_id:f.milestone._id},{status:"APPROVED"});
  const valid=await Review.create({projectId:f.project._id,reviewerId:f.project.clientId,revieweeId:f.bid.studentId,rating:4,comment:"Factual completed-work feedback."});
  await Review.create({projectId:f.project._id,reviewerId:new mongoose.Types.ObjectId(),revieweeId:f.bid.studentId,rating:5,comment:"Invented nonparticipant rating."});
  assert.deepEqual((await verifiedReviews({revieweeId:f.bid.studentId})).map(r=>String(r._id)),[String(valid._id)]);
  await Project.updateOne({_id:f.project._id},{sampleData:true});assert.equal((await verifiedReviews({revieweeId:f.bid.studentId})).length,0);
});

test("sample seeder is additive, rerunnable, category-complete and refuses the application database",async()=>{
  const base=process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27128/settlement_test?replicaSet=audit";
  const uri=base.replace(/\/[\w-]+(?=\?)/,"/bidhub_seed_regression");
  const dbClient=await new mongoose.mongo.MongoClient(uri).connect();
  try {
    const db=dbClient.db();await db.collection("users").insertOne({name:"Existing record",email:"retained@fixture.invalid",role:"client"});
    for(let i=0;i<2;i++) {
      const result=spawnSync(process.execPath,["scripts/seed-samples.js"],{cwd:new URL("../",import.meta.url),env:{...process.env,NODE_ENV:"test",ALLOW_SAMPLE_SEED:"yes",SEED_MONGODB_URI:uri,SEED_PASSWORD:"IsolatedSeedPassword123!"},encoding:"utf8",windowsHide:true,timeout:60000});
      assert.equal(result.status,0,result.stderr);assert.equal(await db.collection("projects").countDocuments(),70);
    }
    const groups=await db.collection("projects").aggregate([{$group:{_id:"$category",count:{$sum:1}}}]).toArray();assert.equal(groups.length,7);assert.ok(groups.every(row=>row.count===10));
    assert.ok(await db.collection("users").findOne({email:"retained@fixture.invalid"}));
    assert.equal(await db.collection("reviews").countDocuments({sampleData:{$ne:true}}),0);
    assert.equal(await db.collection("contracts").countDocuments({sampleData:{$ne:true}}),0);
    const refused=spawnSync(process.execPath,["scripts/seed-samples.js"],{cwd:new URL("../",import.meta.url),env:{...process.env,NODE_ENV:"test",ALLOW_SAMPLE_SEED:"yes",SEED_MONGODB_URI:base,SEED_PASSWORD:"IsolatedSeedPassword123!"},encoding:"utf8",windowsHide:true,timeout:10000});assert.equal(refused.status,1);
  } finally {await dbClient.close();}
});

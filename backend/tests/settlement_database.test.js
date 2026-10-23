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
import { Message } from "../models/Message.js";
import { Review } from "../models/Review.js";
import { PaymentEvent } from "../models/PaymentEvent.js";
import { FundingAttempt } from "../models/FundingAttempt.js";
import { User } from "../models/User.js";
process.env.PRODUCT_MODE = "demo";
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
  assert.equal(contract.totalPaise, 7500); assert.equal(contract.proposalVersion, 2);
  contract.totalPaise = 9000; await contract.save();
  assert.equal((await Contract.findById(contract._id)).totalPaise, 7500);
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
    await PaymentLedger.updateOne({ milestoneId: milestone._id }, { status: "PENDING_REVIEW" });
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
  await PaymentLedger.updateOne({ milestoneId: f.milestone._id }, { status: "PENDING_REVIEW" });
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
  assert.equal(allocation.status, "RELEASED");
  assert.equal(allocation.stripeTransferId, "");
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
  process.env.PRODUCT_MODE="demo";
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

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import mongoose from "mongoose";
import { settlePayment } from "../payments/settle.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Milestone } from "../models/Milestone.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { MilestoneSubmission } from "../models/MilestoneSubmission.js";
process.env.PAYMENT_PROVIDER = "mock";
process.env.NODE_ENV = "test";
const { default: milestoneRouter } = await import("../routes/milestones.js");

const binary = process.env.MONGOD_BINARY || "C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe";
const available = fs.existsSync(binary);
let child;
let directory;
before(async () => {
  if (!available) return;
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

async function fixture() {
  const clientId = new mongoose.Types.ObjectId(), studentId = new mongoose.Types.ObjectId();
  const project = await Project.create({ clientId, title: "Transaction test", description: "Synthetic fixture", category: "Web", budget: 100, deadline: "2027-01-01", status: "PENDING_FUNDING" });
  const bid = await Bid.create({ projectId: project._id, studentId, amount: "100", timeline: "one week", proposal: "Synthetic proposal", status: "PENDING" });
  const milestone = await Milestone.create({ projectId: project._id, title: "Delivery", amount: 100 });
  const orderId = "order_" + project._id;
  await PaymentLedger.create({ projectId: project._id, bidId: bid._id, clientId, studentId, amount: 100, amountPaise: 10000, provider: "mock", stripeSessionId: orderId, allocationSchedule: [{ milestoneId: milestone._id, amountPaise: 10000 }] });
  const settle = () => settlePayment(project._id, bid._id, 100, orderId, "pay_" + project._id);
  return { project, bid, milestone, orderId, settle };
}

test("settlement rolls back assignment on injected allocation failure and retry succeeds", { skip: !available }, async t => {
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

test("parallel settlement produces one assignment and allocation set", { skip: !available }, async () => {
  const f = await fixture();
  assert.deepEqual(await Promise.all([f.settle(), f.settle(), f.settle()]), [true, true, true]);
  assert.equal(await PaymentLedger.countDocuments({ stripeSessionId: f.orderId, milestoneId: { $ne: null } }), 1);
});

test("changed allocation schedule fails closed before assignment", { skip: !available }, async () => {
  const f = await fixture();
  await Milestone.updateOne({ _id: f.milestone._id }, { amount: 10000 });
  assert.equal(await f.settle(), false);
  assert.equal((await Project.findById(f.project._id)).status, "PENDING_FUNDING");
});

test("demo release rolls back all financial writes and requires the viewed submission", { skip: !available }, async t => {
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

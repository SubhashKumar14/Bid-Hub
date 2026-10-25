import { Contract } from "../models/Contract.js";
import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import express from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Milestone } from "../models/Milestone.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { Review } from "../models/Review.js";

// Actual Express routes and JWT middleware, with in-memory persistence doubles.
// No database connection, gateway request, or deployed API is used.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "audit-regression-secret-for-local-tests-only";
process.env.PAYMENT_PROVIDER = "razorpay";
process.env.RAZORPAY_KEY_ID = "rzp_test_regression";
process.env.RAZORPAY_KEY_SECRET = "local-test-secret";
const { default: payments } = await import("../routes/payments.js");
const { default: projects } = await import("../routes/projects.js");
const { default: users } = await import("../routes/users.js");
const { default: messages } = await import("../routes/messages.js");
const { default: milestonesRouter } = await import("../routes/milestones.js");
const { default: reviewsRouter } = await import("../routes/reviews.js");
const { default: uploads } = await import("../routes/uploads.js");
const { validFileContent } = await import("../lib/file-content.js");
const { amountToPaise, positiveEnvironmentInteger } = await import("../lib/validation.js");
const { PaymentEvent } = await import("../models/PaymentEvent.js");
const { getPaymentProvider } = await import("../payments/index.js");

const query = (value) => ({
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  skip() { return this; },
  limit() { return this; },
  distinct() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
});

test("rate limit overrides reject malformed or unbounded values rather than disabling protection", () => {
  assert.equal(positiveEnvironmentInteger("LIMIT", 10, 10000, {}), 10);
  assert.equal(positiveEnvironmentInteger("LIMIT", 10, 10000, { LIMIT: "1000" }), 1000);
  for (const LIMIT of ["bad", "10junk", "0", "-1", "1.5", "Infinity", "10001"]) assert.throws(() => positiveEnvironmentInteger("LIMIT", 10, 10000, { LIMIT }), /must be an integer/);
});
const identities = {
  owner: { _id: "owner", role: "client" },
  other: { _id: "other", role: "client" },
  student: { _id: "student", role: "student" },
};
const matches = (record, filter) => record && Object.entries(filter).every(
  ([key, value]) => String(record[key]) === String(value)
);
let server;
let base;
before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/payments", payments);
  app.use("/api/projects", projects);
  app.use("/api/users", users);
  app.use("/api/messages", messages);
  app.use("/api/milestones", milestonesRouter);
  app.use("/api/reviews", reviewsRouter);
  app.use("/api/uploads", uploads);
  app.get("/health", (req, res) => res.json({ alive: true }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test("malformed search and chat return 400 and the same HTTP server survives", async t => {
  auth(t);
  for (const queryString of ["search[]=a", "search[x]=a", "skills[]=a", "category[x]=a", "sort=constructor", "limit=10000000", "page=-1"]) {
    assert.equal((await request("/api/projects?" + queryString)).status, 400);
  }
  for (const content of [[], {}, null, 42, "x".repeat(5001)]) {
    assert.equal((await request("/api/messages", "owner", { projectId: "project", content })).status, 400);
  }
  assert.equal((await request("/health")).status, 200);
});

test("message pagination and review comments reject malformed fields before database queries", async t => {
  auth(t);
  assert.equal((await request("/api/messages/project?limit=1000000000", "owner")).status, 400);
  assert.equal((await request("/api/messages/project?page=-1", "owner")).status, 400);
  for (const comment of [undefined, null, {}, ""]) {
    assert.equal((await request("/api/reviews", "owner", { projectId: "p", revieweeId: "s", rating: 5, comment })).status, 400);
  }
});

test("missing and misspelled release actions are rejected, and production approval cannot invent a payout", async t => {
  auth(t);
  for (const status of [undefined, "APROVED", "RELEASED"]) {
    const response = await fetch(base + "/api/milestones/m/release", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ id: "owner" }, process.env.JWT_SECRET)}` }, body: JSON.stringify({ status }) });
    assert.equal(response.status, 400);
  }
  process.env.NODE_ENV = "production";
  try {
    const response = await fetch(base + "/api/milestones/m/release", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt.sign({ id: "owner" }, process.env.JWT_SECRET)}` }, body: JSON.stringify({ status: "APPROVED" }) });
    assert.equal(response.status, 400);
  } finally { process.env.NODE_ENV = "test"; }
});

test("upload query parameters cannot enable ZIP, and a disguised PNG is rejected", async t => {
  auth(t);
  for (const [filename, mime, url] of [["payload.zip", "application/zip", "/api/uploads/files?x=/import/"], ["payload.png", "image/png", "/api/uploads/files"]]) {
    const form = new FormData(); form.append("files", new Blob(["inert text"], { type: mime }), filename);
    const response = await fetch(base + url, { method: "POST", headers: { Authorization: `Bearer ${jwt.sign({ id: "owner" }, process.env.JWT_SECRET)}` }, body: form });
    assert.ok(response.status >= 400);
  }
  assert.equal(validFileContent(Buffer.from("text"), ".png"), false);
});

test("money parser accepts exact paise and rejects ambiguous and nonfinite amounts", () => {
  assert.equal(amountToPaise("10.01"), 1001);
  for (const value of ["abc", "Infinity", Infinity, NaN, "1e2", "-1", "0", "1.001", [], {}, "₹100", "100junk"]) assert.throws(() => amountToPaise(value));
});

test("unknown captured webhook is durably marked for reconciliation before acknowledgement", async t => {
  const provider = getPaymentProvider();
  t.mock.method(provider, "verifyWebhook", async () => ({ success: true, sessionId: "order_late", paymentIntentId: "pay_late", amountPaise: 10000, amount: 100 }));
  t.mock.method(PaymentLedger, "findOne", () => query(null));
  const writes = [];
  t.mock.method(PaymentEvent, "updateOne", async (...args) => { writes.push(args); });
  const result = await request("/api/payments/webhook", undefined, { fixture: true });
  assert.equal(result.status, 200);
  assert.equal(result.body.outcome, "NEEDS_RECONCILIATION");
  assert.equal(writes.length, 2);
  assert.equal(writes[0][1].$setOnInsert.amountPaise, 10000);
  assert.equal(writes[1][1].status, "NEEDS_RECONCILIATION");
});
after(() => new Promise(resolve => server.close(resolve)));
afterEach(t => t.mock.restoreAll());

function auth(t) {
  t.mock.method(Contract, "exists", () => query(null));
  t.mock.method(User, "findById", id => query(identities[id]));
}
async function request(path, identity, body) {
  const headers = {};
  if (identity) headers.Authorization = `Bearer ${jwt.sign({ id: identity }, process.env.JWT_SECRET)}`;
  if (body) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, {
    method: body ? "POST" : "GET", headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, body: await response.json() };
}

test("production verify rejects a simulated signature before any persistence access", async t => {
  auth(t);
  const reads = t.mock.method(PaymentLedger, "findOne", () => { throw new Error("Unexpected ledger access"); });
  const writes = t.mock.method(Project, "findOneAndUpdate", () => { throw new Error("Unexpected project write"); });
  process.env.NODE_ENV = "production";
  try {
    const result = await request("/api/payments/verify", "owner", {
      razorpay_order_id: "order_123", razorpay_payment_id: "pay_123", razorpay_signature: "signature_simulated",
    });
    assert.equal(result.status, 400);
    assert.match(result.body.message, /signature verification failed/);
    assert.equal(reads.mock.callCount(), 0);
    assert.equal(writes.mock.callCount(), 0);
  } finally {
    process.env.NODE_ENV = "test";
  }
});

for (const body of [{ projectId: "project" }, { sessionId: "order_123" }]) {
  for (const identity of [undefined, "student", "other"]) {
    test(`cancel denies ${identity || "anonymous"} using ${Object.keys(body)[0]}`, async t => {
      auth(t);
      const ledger = { _id: "ledger", projectId: "project", clientId: "owner", stripeSessionId: "order_123", status: "PENDING_CHECKOUT" };
      t.mock.method(PaymentLedger, "findOne", filter => query(matches(ledger, filter) ? ledger : null));
      const transitions = t.mock.method(Project, "findOneAndUpdate", filter => {
        assert.equal(filter.clientId, "other");
        assert.equal(filter.status, "PENDING_FUNDING");
        return query(null);
      });
      const writes = t.mock.method(PaymentLedger, "updateOne", () => { throw new Error("Unexpected write"); });
      const result = await request("/api/payments/cancel", identity, body);
      assert.equal(result.status, !identity ? 401 : identity === "student" ? 403 : 404);
      assert.equal(writes.mock.callCount(), 0);
      if (identity !== "other") assert.equal(transitions.mock.callCount(), 0);
    });
  }
}

for (const status of ["ASSIGNED", "COMPLETED", "OPEN", "PENDING_FUNDING"]) {
  test(`legacy checkout dismissal preserves payable order and owned state (${status})`, async t => {
    auth(t);
    const project = { _id: "project", clientId: "owner", status };
    const ledger = { _id: "ledger", projectId: "project", clientId: "owner", status: "PENDING_CHECKOUT" };
    t.mock.method(PaymentLedger, "findOne", () => query(ledger));
    t.mock.method(Project, "findOne", filter => query(matches(project, filter) ? project : null));
    const writes = t.mock.method(PaymentLedger, "updateOne", () => { throw new Error("Dismissal must not invalidate a payable order"); });
    const result = await request("/api/payments/cancel", "owner", { sessionId: "order_123" });
    assert.equal(result.status, status === "PENDING_FUNDING" ? 200 : 409);
    assert.equal(project.status, status); assert.equal(ledger.status,"PENDING_CHECKOUT");
    assert.equal(writes.mock.callCount(), 0);
  });
}

test("project-only dismissal with no known order never blindly reopens funding", async t => {
  auth(t);
  t.mock.method(PaymentLedger, "findOne", () => query(null));
  const writes = t.mock.method(Project, "findOneAndUpdate", () => { throw new Error("Unknown funding must not be reopened"); });
  assert.equal((await request("/api/payments/cancel", "owner", { projectId: "project" })).status, 404);
  assert.equal(writes.mock.callCount(),0);
});

test("public project details never read or return a pending ledger", async t => {
  t.mock.method(Project, "findById", () => query({ _id: "project", status: "PENDING_FUNDING" }));
  t.mock.method(Milestone, "find", () => query([]));
  const read = t.mock.method(PaymentLedger, "findOne", () => { throw new Error("Private payment read"); });
  const result = await request("/api/projects/project");
  assert.equal(result.status, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ["milestones", "project"]);
  assert.equal(read.mock.callCount(), 0);
});

for (const identity of [undefined, "student", "other", "owner"]) {
  test(`checkout recovery restricts access and fields (${identity || "anonymous"})`, async t => {
    auth(t);
    const project = { _id: "project", clientId: "owner", status: "PENDING_FUNDING" };
    t.mock.method(Project, "findOne", filter => query(matches(project, filter) ? project : null));
    const read = t.mock.method(PaymentLedger, "findOne", filter => {
      assert.deepEqual(filter, { projectId: "project", clientId: "owner", milestoneId: null, status: "PENDING_CHECKOUT" });
      return query({ stripeSessionId: "order_123", studentId: "student", amount: 100, clientId: "owner", stripePaymentIntentId: "private", transactionRef: "private" });
    });
    const result = await request("/api/projects/project/checkout", identity);
    assert.equal(result.status, !identity ? 401 : identity === "student" ? 403 : identity === "other" ? 404 : 200);
    if (identity === "owner") {
      assert.deepEqual(result.body, { pendingPayment: { stripeSessionId: "order_123", studentId: "student", amount: 100 } });
    } else assert.equal(read.mock.callCount(), 0);
  });
}

test("student dashboard handles deleted projects with pending checkouts", async t => {
  auth(t);
  t.mock.method(Bid, "find", () => query([
    { _id: "deleted-bid", projectId: null, amount: "100", status: "PENDING" },
    { _id: "pending-bid", projectId: { _id: "pending", title: "Current project" }, amount: "100", status: "PENDING" },
  ]));
  t.mock.method(Project, "find", () => query([]));
  t.mock.method(Project, "countDocuments", async () => 0);
  t.mock.method(Bid, "countDocuments", async () => 2);
  t.mock.method(Bid, "aggregate", async () => [{ total: 1 }]);
  t.mock.method(Milestone, "find", () => query([]));
  t.mock.method(PaymentLedger, "find", () => query([{ projectId: "pending" }]));
  const result = await request("/api/projects/student/dashboard", "student");
  assert.equal(result.status, 200);
  assert.equal(result.body.bids[0].title, "Deleted Project");
  assert.equal(result.body.bids[0].status, "pending");
  assert.equal(result.body.bids[1].status, "agreed (funding pending)");
});

test("authenticated self profile polling preserves views; external visit increments", async t => {
  let saves = 0;
  const profile = { _id: "student", profileViews: 7, async save() { saves++; } };
  t.mock.method(User, "findById", () => query(profile));
  t.mock.method(Review, "find", () => query([]));
  for (let i = 0; i < 3; i++) {
    const result = await request("/api/users/student", "student");
    assert.equal(result.status, 200);
    assert.equal(result.body.user.profileViews, 7);
  }
  assert.equal(saves, 0);
  assert.equal((await request("/api/users/student")).body.user.profileViews, 8);
  assert.equal(saves, 1);
});

for (const configuration of [
  { PAYMENT_PROVIDER: "mock" },
  { PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "", RAZORPAY_KEY_SECRET: "" },
  { PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_test_placeholder", RAZORPAY_KEY_SECRET: "placeholdersecret" },
]) {
  test(`production rejects unsafe payment configuration: ${JSON.stringify(configuration)}`, () => {
    const child = spawnSync(process.execPath, ["--input-type=module", "-e",
      'import { getPaymentProvider } from "./payments/index.js"; getPaymentProvider();',
    ], {
      cwd: new URL("../", import.meta.url),
      env: { ...process.env, ...configuration, NODE_ENV: "production", PRODUCT_MODE: "test" },
      encoding: "utf8", timeout: 10000,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    assert.match(child.stderr, /Mock payments are disabled|are required|Placeholder Razorpay credentials/);
  });
}

for (const [label, environment, expected] of [
  ["explicit production demo permits only simulated funding", { PRODUCT_MODE: "demo", PAYMENT_PROVIDER: "mock" }, 0],
  ["production outside Render requires an explicit product mode", { PRODUCT_MODE: "", PAYMENT_PROVIDER: "mock" }, 1],
  ["Render defaults select demo without activating configured live credentials", { RENDER: "true", PRODUCT_MODE: "", PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_live_synthetic", RAZORPAY_KEY_SECRET: "synthetic-secret" }, 0],
  ["test mode rejects live payment credentials", { PRODUCT_MODE: "test", PAYMENT_PROVIDER: "razorpay", RAZORPAY_KEY_ID: "rzp_live_synthetic", RAZORPAY_KEY_SECRET: "synthetic-secret" }, 1],
]) {
  test(label, () => {
    const child=spawnSync(process.execPath,["--input-type=module","-e",'import { getPaymentProvider } from "./payments/index.js"; import { capabilities } from "./config/capabilities.js"; getPaymentProvider(); if (capabilities().livePayments || capabilities().payouts) throw new Error("Live financial capability must remain disabled");'],{cwd:new URL("../",import.meta.url),env:{...process.env,RENDER:"",...environment,NODE_ENV:"production"},encoding:"utf8",windowsHide:true,timeout:10000});
    assert.equal(child.error,undefined); assert.equal(child.status,expected,child.stderr);
  });
}

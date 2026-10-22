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

const query = (value) => ({
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); },
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
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
afterEach(t => t.mock.restoreAll());

function auth(t) {
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
  test(`session cancellation only reopens an owned pending project (${status})`, async t => {
    auth(t);
    const project = { _id: "project", clientId: "owner", status };
    const ledger = { _id: "ledger", projectId: "project", clientId: "owner", status: "PENDING_CHECKOUT" };
    t.mock.method(PaymentLedger, "findOne", () => query(ledger));
    t.mock.method(Project, "findOneAndUpdate", (filter, update) => {
      assert.equal(filter.clientId, "owner");
      assert.equal(filter.status, "PENDING_FUNDING");
      if (!matches(project, filter)) return query(null);
      Object.assign(project, update.$set);
      return query(project);
    });
    const writes = t.mock.method(PaymentLedger, "updateOne", (filter, update) => {
      assert.deepEqual(filter, { _id: "ledger", clientId: "owner", status: "PENDING_CHECKOUT" });
      assert.equal(update.$set.status, "FAILED");
      return query({ modifiedCount: 1 });
    });
    const result = await request("/api/payments/cancel", "owner", { sessionId: "order_123" });
    assert.equal(result.status, status === "PENDING_FUNDING" ? 200 : 409);
    assert.equal(project.status, status === "PENDING_FUNDING" ? "OPEN" : status);
    assert.equal(writes.mock.callCount(), status === "PENDING_FUNDING" ? 1 : 0);
  });
}

test("project-only cancellation atomically resets an owned pending project", async t => {
  auth(t);
  t.mock.method(PaymentLedger, "findOne", () => query(null));
  t.mock.method(Project, "findOneAndUpdate", (filter, update) => {
    assert.deepEqual(filter, { _id: "project", clientId: "owner", status: "PENDING_FUNDING" });
    assert.equal(update.$set.status, "OPEN");
    return query({ _id: "project", status: "OPEN" });
  });
  assert.equal((await request("/api/payments/cancel", "owner", { projectId: "project" })).status, 200);
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
  t.mock.method(Milestone, "find", () => query([]));
  t.mock.method(PaymentLedger, "find", () => query([{ projectId: "pending" }]));
  const result = await request("/api/projects/student/dashboard", "student");
  assert.equal(result.status, 200);
  assert.equal(result.body.bids[0].title, "Deleted Project");
  assert.equal(result.body.bids[0].status, "pending");
  assert.equal(result.body.bids[1].status, "accepted (escrow pending)");
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
      env: { ...process.env, ...configuration, NODE_ENV: "production" },
      encoding: "utf8", timeout: 10000,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 1);
    assert.match(child.stderr, /Mock payments are disabled|are required|Placeholder Razorpay credentials/);
  });
}

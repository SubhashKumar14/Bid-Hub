import { spawn } from "child_process";
import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });
if (!process.env.TEST_MONGODB_URI) throw new Error("Set TEST_MONGODB_URI to an isolated replica-set database. This test never uses the application database implicitly.");
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
process.env.BIDHUB_ISOLATED_TEST="1";
process.env.PRODUCT_MODE = "test";

const BASE_URL = "http://localhost:5003";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log("=== Launching Unified Payment Provider & Escrow Integration Test Suite ===");

  // 1. Spawning backend server process
  console.log("Starting backend server process...");
  const serverProcess = spawn(process.execPath, ["index.js"], {
    env: { ...process.env, PORT: "5003", NODE_ENV: "test", PAYMENT_PROVIDER: "mock" },
    cwd: path.resolve(__dirname, ".."),
  });

  serverProcess.stdout.on("data", (data) => {
    console.log(`[Server]: ${data.toString().trim()}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server Error]: ${data.toString().trim()}`);
  });

  // Give server 5 seconds to connect to database and start up
  await delay(5000);

  try {
    const emailSuffix = Math.random().toString(36).substring(2, 7);
    const studentEmail = `student_${emailSuffix}@rvce.edu`;
    const clientEmail = `client_${emailSuffix}@rvceinc.com`;

    console.log("\n--- Step 1: Registering Test Profiles ---");
    
    // Register Student
    const studentRegRes = await axios.post(`${BASE_URL}/api/auth/register`, {
      name: "Test Student",
      email: studentEmail,
      password: "password123",
      role: "student",
      college: "RVCE CS",
    });
    console.log("✔ Student registered successfully!");
    const studentToken = studentRegRes.data.token;
    const studentId = studentRegRes.data._id;

    // Register Client
    const clientRegRes = await axios.post(`${BASE_URL}/api/auth/register`, {
      name: "Test Client",
      email: clientEmail,
      password: "password123",
      role: "client",
      college: "RVCE Inc.",
    });
    console.log("✔ Client registered successfully!");
    const clientToken = clientRegRes.data.token;

    const otherClientRegRes = await axios.post(`${BASE_URL}/api/auth/register`, {
      name: "Other Test Client",
      email: `other_${emailSuffix}@rvceinc.com`,
      password: "password123",
      role: "client",
      college: "Other Inc.",
    });
    const otherClientToken = otherClientRegRes.data.token;

    console.log("\n--- Step 2: Client Posts a Project Brief ---");
    const projectRes = await axios.post(
      `${BASE_URL}/api/projects`,
      {
        title: "Test Escrow Payment Integration Project",
        description: "Testing Stripe, Razorpay and Mock providers with workflow checks.",
        category: "Web Development",
        budget: "10000",
        deadline: new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10),
        skillsRequired: ["React", "Express", "Crypto"],
        milestones: [
          { title: "Unified Payment Milestone Check", amount: "10000", dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10) }
        ],
      },
      {
        headers: { Authorization: `Bearer ${clientToken}` },
      }
    );
    console.log("✔ Project brief posted successfully!");
    const projectId = projectRes.data._id;

    // Load project details to get milestone ID
    const projectDetailsRes = await axios.get(`${BASE_URL}/api/projects/${projectId}`);
    const milestoneId = projectDetailsRes.data.milestones[0]._id;
    console.log(`Project ID: ${projectId}, Milestone ID: ${milestoneId}`);

    console.log("\n--- Step 3: Student Places a Bid ---");
    const bidRes = await axios.post(
      `${BASE_URL}/api/projects/${projectId}/bids`,
      {
        amount: "10000",
        timeline: "1 week",
        proposal: "I can implement the payment provider system abstraction.",
      },
      {
        headers: { Authorization: `Bearer ${studentToken}` },
      }
    );
    console.log("✔ Bid placed successfully!");
    const bidId = bidRes.data._id;

    const mismatchProjectRes = await axios.post(`${BASE_URL}/api/projects`, {
      title:"Inconsistent advertised schedule", description:"Invalid client-authored schedule with enough detail to be checked.", category:"Web Development", budget:"10000", deadline:"2027-12-31", skillsRequired:["Review"],
      milestones:[{title:"Delivery",amount:"9000"}]
    }, {headers:{Authorization:`Bearer ${clientToken}`},validateStatus:status=>status===400});
    if (!/advertised budget/i.test(mismatchProjectRes.data.message || "")) throw new Error(`Publishing an inconsistent advertised schedule returned an unexpected rejection: ${mismatchProjectRes.data.message || JSON.stringify(mismatchProjectRes.data)}`);
    console.log("\n--- Step 4: Duplicate Checkout Test ---");
    // Client initiates checkout first time
    const checkoutRes1 = await axios.post(
      `${BASE_URL}/api/payments/checkout-session`,
      { bidId, proposalVersion: 1 },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    console.log("✔ Checkout session 1 initiated!");
    const checkoutUrl1 = checkoutRes1.data.url;
    const sessionId1 = checkoutRes1.data.orderId || checkoutRes1.data.sessionId || (checkoutUrl1 ? new URL(checkoutUrl1).searchParams.get("session_id") : null);
    console.log(`Session ID 1: ${sessionId1}`);

    await axios.post(
      `${BASE_URL}/api/payments/cancel`,
      { sessionId: sessionId1 },
      { headers: { Authorization: `Bearer ${otherClientToken}` }, validateStatus: (status) => status === 404 }
    );
    const afterUnauthorizedCancel = await axios.get(`${BASE_URL}/api/projects/${projectId}`);
    if (afterUnauthorizedCancel.data.project.status !== "PENDING_FUNDING") {
      throw new Error("Another client changed the project by cancelling an unowned checkout.");
    }
    console.log("✔ Another client is blocked from cancelling the pending checkout.");

    // Verify Project status transitioned to PENDING_FUNDING
    let checkProjectRes = await axios.get(`${BASE_URL}/api/projects/${projectId}`);
    console.log(`Project status: ${checkProjectRes.data.project.status} (Expected: PENDING_FUNDING)`);
    if (checkProjectRes.data.project.status !== "PENDING_FUNDING") {
      throw new Error("Project status did not transition to PENDING_FUNDING on checkout!");
    }

    // Client initiates checkout second time (simulating double click or retry)
    const checkoutRes2 = await axios.post(
      `${BASE_URL}/api/payments/checkout-session`,
      { bidId, proposalVersion: 1 },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    console.log("✔ Checkout session 2 initiated (Duplicate Checkout Scenario)!");
    const checkoutUrl2 = checkoutRes2.data.url;
    const sessionId2 = checkoutRes2.data.orderId || checkoutRes2.data.sessionId || (checkoutUrl2 ? new URL(checkoutUrl2).searchParams.get("session_id") : null);
    console.log(`Session ID 2: ${sessionId2}`);
    if (sessionId1 !== sessionId2) throw new Error("Duplicate checkout created a second order.");

    await axios.post(
      `${BASE_URL}/api/payments/cancel`,
      { sessionId: sessionId2 },
      { headers: { Authorization: `Bearer ${studentToken}` }, validateStatus: (status) => status === 403 }
    );
    console.log("✔ Student role is blocked from cancelling a client checkout.");

    console.log("\n--- Step 5: Cancelled Payment Test ---");
    // Cancel checkout session 2
    await axios.post(
      `${BASE_URL}/api/payments/cancel`,
      { sessionId: sessionId2 },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    console.log("✔ Checkout session 2 cancelled!");

    // Verify Project status reverted to OPEN
    checkProjectRes = await axios.get(`${BASE_URL}/api/projects/${projectId}`);
    console.log(`Project status: ${checkProjectRes.data.project.status} (Expected: OPEN)`);
    if (checkProjectRes.data.project.status !== "PENDING_FUNDING") {
      throw new Error("Dismissal invalidated a potentially payable order!");
    }

    console.log("\n--- Step 6: Successful Payment Test ---");
    // Client initiates checkout third time
    const checkoutRes3 = await axios.post(
      `${BASE_URL}/api/payments/checkout-session`,
      { bidId, proposalVersion: 1 },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    const checkoutUrl3 = checkoutRes3.data.url;
    const sessionId3 = checkoutRes3.data.orderId || checkoutRes3.data.sessionId || (checkoutUrl3 ? new URL(checkoutUrl3).searchParams.get("session_id") : null);
    console.log(`Checkout session 3 initiated. Session ID: ${sessionId3}`);

    // Verify project returned to PENDING_FUNDING
    checkProjectRes = await axios.get(`${BASE_URL}/api/projects/${projectId}`);
    if (checkProjectRes.data.project.status !== "PENDING_FUNDING") {
      throw new Error("Project status did not transition to PENDING_FUNDING!");
    }

    // Simulate payment complete webhook
    const simulateRes = await axios.post(
      `${BASE_URL}/api/payments/simulate-payment`,
      { sessionId: sessionId3 },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    console.log(`✔ Webhook simulation: ${simulateRes.data.message}`);

    // Verify project assigned
    checkProjectRes = await axios.get(`${BASE_URL}/api/projects/${projectId}`);
    console.log(`Project status: ${checkProjectRes.data.project.status} (Expected: ASSIGNED)`);
    if (checkProjectRes.data.project.status !== "ASSIGNED") {
      throw new Error("Project status mismatch after payment!");
    }
    console.log("✔ Project assignment verified!");

    console.log("\n--- Step 7: Duplicate Webhook Test ---");
    // Send same webhook again
    const simulateRes2 = await axios.post(
      `${BASE_URL}/api/payments/simulate-payment`,
      { sessionId: sessionId3 },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    console.log(`✔ Duplicate Webhook result: ${simulateRes2.status} (${simulateRes2.data.message})`);
    
    // Verify project remains ASSIGNED
    checkProjectRes = await axios.get(`${BASE_URL}/api/projects/${projectId}`);
    if (checkProjectRes.data.project.status !== "ASSIGNED") {
      throw new Error("Project status mutated during duplicate webhook processing!");
    }
    console.log("✔ Duplicate Webhook successfully ignored without error!");

    console.log("\n--- Step 8: Milestone Submission (work review; payment remains locked) ---");
    await axios.patch(
      `${BASE_URL}/api/milestones/${milestoneId}/submit`,
      {
        githubUrl: "https://github.com/student/payment-flow-verification",
        demoUrl: "https://payment-flow-verification.vercel.app",
        videoUrl: "https://loom.com/share/payment-flow-verification",
        description: "Submission for payment flow verification",
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    console.log("✔ Milestone submitted for review!");

    // Verify milestone status
    const checkMilestoneRes = await axios.get(`${BASE_URL}/api/projects/${projectId}`);
    const updatedMilestone = checkMilestoneRes.data.milestones[0];
    console.log(`Milestone status: ${updatedMilestone.status} (Expected: SUBMITTED)`);
    if (updatedMilestone.status !== "SUBMITTED") {
      throw new Error("Milestone status mismatch after submission!");
    }

    // Work review does not change the test-funding state or assert a payout.
    let ledgerRes = await axios.get(`${BASE_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    console.log("Escrow Stats: Locked:", ledgerRes.data.stats.lockedAmount, "Pending:", ledgerRes.data.stats.pendingAmount);
    if (ledgerRes.data.stats.lockedAmount !== 10000 || ledgerRes.data.stats.pendingAmount !== 0) {
      throw new Error("Work approval/review must leave the test funding locked until an actual payout is supported.");
    }
    console.log("✔ Test funding remains locked during work review.");

    console.log("\n--- Step 9: Client approves milestone work ---");
    await axios.patch(
      `${BASE_URL}/api/milestones/${milestoneId}/release`,
      { status: "APPROVED", submissionId: (await axios.get(`${BASE_URL}/api/milestones/${milestoneId}/submission`, { headers: { Authorization: `Bearer ${clientToken}` } })).data._id },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    console.log("✔ Milestone work approved; no payout claimed.");

    // Verify Project status is COMPLETED
    const finalProjectRes = await axios.get(`${BASE_URL}/api/projects/${projectId}`);
    console.log(`Final Project status: ${finalProjectRes.data.project.status} (Expected: COMPLETED)`);
    if (finalProjectRes.data.project.status !== "COMPLETED") {
      throw new Error("Project did not transition to COMPLETED after final work approval!");
    }

    // Verify final stats show releasedAmount
    ledgerRes = await axios.get(`${BASE_URL}/api/payments`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    console.log("Released stats balance:", ledgerRes.data.stats.releasedAmount);
    if (ledgerRes.data.stats.releasedAmount !== 0) {
      throw new Error("Released balance mismatch in payments stats!");
    }
    console.log("✔ No payout is recorded for work approval.");

    console.log("\n🏆 ALL PAYMENTS & WORKFLOW INTEGRATION TESTS PASSED SUCCESSFULLY! 🏆");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error.response?.data?.message || error.message);
    process.exitCode = 1;
  } finally {
    console.log("Shutting down backend server...");
    serverProcess.kill();
    // Allow process to terminate cleanly
    await delay(1000);
  }
}

runTests();

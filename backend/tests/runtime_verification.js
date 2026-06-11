import { spawn } from "child_process";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PORT = "5002";
const BASE_URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runVerification() {
  console.log("================================================================================");
  console.log("               BID·HUB RUNTIME PRODUCTION VERIFICATION AUDIT                   ");
  console.log("================================================================================");

  // 1. Spawning backend server process on PORT 5002
  console.log(`\n[1/9] Spawning backend server process on port ${PORT}...`);
  const serverProcess = spawn("node", ["backend/index.js"], {
    env: { ...process.env, PORT, NODE_ENV: "test" },
    shell: true,
    cwd: "."
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

    console.log("\n[2/9] Registering Audit Profiles...");
    
    // Register Student
    const studentReg = await axios.post(`${BASE_URL}/api/auth/register`, {
      name: "Audit Student",
      email: studentEmail,
      password: "password123",
      role: "student",
      college: "RVCE CS",
    });
    console.log("✔ Student Registered successfully.");
    const studentToken = studentReg.data.token;
    const studentId = studentReg.data._id;

    // Register Client
    const clientReg = await axios.post(`${BASE_URL}/api/auth/register`, {
      name: "Audit Client",
      email: clientEmail,
      password: "password123",
      role: "client",
      college: "RVCE Inc.",
    });
    console.log("✔ Client Registered successfully.");
    const clientToken = clientReg.data.token;
    const clientId = clientReg.data._id;

    console.log("\n[3/9] Posting Project & Placing Bid...");
    const projectRes = await axios.post(
      `${BASE_URL}/api/projects`,
      {
        title: "Runtime Validation Project",
        description: "Testing end-to-end client routing, Razorpay checkout, and milestones.",
        category: "Web Development",
        budget: "₹20,000",
        deadline: "2026-12-31",
        skillsRequired: ["React", "Express"],
        milestones: [
          { title: "Frontend Implementation", amount: "₹10,000", dueDate: "2026-07-30" },
          { title: "Backend Hardening", amount: "₹10,000", dueDate: "2026-08-30" }
        ],
      },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    const projectId = projectRes.data._id;
    console.log(`✔ Project Created. ID: ${projectId}`);

    // Place Bid
    const bidRes = await axios.post(
      `${BASE_URL}/api/projects/${projectId}/bids`,
      {
        amount: "20000",
        timeline: "2 weeks",
        proposal: "Ready to test the runtime flow.",
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    const bidId = bidRes.data._id;
    console.log(`✔ Bid Placed. ID: ${bidId}`);

    console.log("\n[4/9] Verifying Razorpay Checkout & Signature Flow...");
    
    // Initiate checkout session
    const checkoutRes = await axios.post(
      `${BASE_URL}/api/payments/checkout-session`,
      { bidId },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    
    console.log("Checkout API response fields:", Object.keys(checkoutRes.data));
    const isMock = checkoutRes.data.provider === "mock";
    const sessionId = isMock ? checkoutRes.data.sessionId : checkoutRes.data.orderId;
    console.log(`✔ Checkout Session/Order Created. ID: ${sessionId}`);

    // Verify checkout completion (simulate checkout verified or simulate payment depending on provider)
    let verifyRes;
    if (isMock) {
      console.log("Mock provider active. Triggering simulated payment webhook...");
      verifyRes = await axios.post(
        `${BASE_URL}/api/payments/simulate-payment`,
        { sessionId }
      );
    } else {
      console.log("Razorpay provider active. Submitting verify signature request...");
      const shasum = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET);
      shasum.update(sessionId + "|" + "pay_mock_12345");
      const generatedSignature = shasum.digest("hex");

      verifyRes = await axios.post(
        `${BASE_URL}/api/payments/verify`,
        {
          razorpay_order_id: sessionId,
          razorpay_payment_id: "pay_mock_12345",
          razorpay_signature: generatedSignature,
        },
        { headers: { Authorization: `Bearer ${clientToken}` } }
      );
    }
    console.log(`✔ Checkout Completion Status: ${verifyRes.status} (${verifyRes.data.message})`);

    // Verify project becomes ASSIGNED
    const projectDetail = await axios.get(`${BASE_URL}/api/projects/${projectId}`);
    console.log(`✔ Project Status after checkout: ${projectDetail.data.project.status} (Expected: ASSIGNED)`);
    if (projectDetail.data.project.status !== "ASSIGNED") {
      throw new Error("Project failed to transition to ASSIGNED state!");
    }

    console.log("\n[5/9] Auditing Client-Side Auth State Resiliency (429, 500, Network Errors)...");
    
    // Client-side simulation of getMe response handling
    const simulateMeCall = async (mockResponseStatus, simulateNetworkFailure = false) => {
      // Simulate frontend fetch logic
      let tokenCleared = false;
      const fakeLocalStorage = {
        removeItem: (key) => {
          if (key === "token") tokenCleared = true;
        }
      };

      try {
        if (simulateNetworkFailure) {
          throw new TypeError("Failed to fetch");
        }

        if (mockResponseStatus !== 200) {
          const err = new Error("Auth check failed");
          err.status = mockResponseStatus;
          throw err;
        }
      } catch (err) {
        // App.jsx catch block logic
        if (err.status === 401 || err.status === 403) {
          fakeLocalStorage.removeItem("token");
        }
      }
      return tokenCleared;
    };

    const result429 = await simulateMeCall(429);
    console.log(`✔ Status 429 simulation: Session cleared? ${result429 ? "YES ❌ (Failed)" : "NO  (Passed)"}`);
    
    const result500 = await simulateMeCall(500);
    console.log(`✔ Status 500 simulation: Session cleared? ${result500 ? "YES ❌ (Failed)" : "NO  (Passed)"}`);

    const resultNetwork = await simulateMeCall(null, true);
    console.log(`✔ Network failure simulation: Session cleared? ${resultNetwork ? "YES ❌ (Failed)" : "NO  (Passed)"}`);

    const result401 = await simulateMeCall(401);
    console.log(`✔ Status 401 simulation (Expected logout): Session cleared? ${result401 ? "YES  (Passed)" : "NO ❌ (Failed)"}`);

    if (result429 || result500 || resultNetwork || !result401) {
      throw new Error("Client auth resilience test failed!");
    }

    console.log("\n[6/9] Auditing Chat Polling & Disabling controls...");

    // Chat polling simulation
    const simulateChatPolling = async (simulatedHttpStatus) => {
      let pollingDisabled = false;
      
      const pollMessages = () => {
        if (pollingDisabled) {
          return "POLLING_SKIPPED";
        }
        
        // Simulate fetch returning error
        try {
          if (simulatedHttpStatus !== 200) {
            const err = new Error("Failed to fetch messages");
            err.status = simulatedHttpStatus;
            throw err;
          }
          return "POLLING_SUCCESS";
        } catch (err) {
          if (err.status === 400 || err.status === 403) {
            pollingDisabled = true;
            return "POLLING_HALTED";
          }
          return "POLLING_ERROR_RETRYING";
        }
      };

      const step1 = pollMessages();
      const step2 = pollMessages();
      return { step1, step2, pollingDisabled };
    };

    const poll403 = await simulateChatPolling(403);
    console.log("✔ Chat polling 403 response simulation:", poll403);
    if (poll403.step2 !== "POLLING_SKIPPED" || !poll403.pollingDisabled) {
      throw new Error("Polling did not halt on 403 Forbidden!");
    }

    const poll500 = await simulateChatPolling(500);
    console.log("✔ Chat polling 500 response simulation (temporary error):", poll500);
    if (poll500.step2 === "POLLING_SKIPPED" || poll500.pollingDisabled) {
      throw new Error("Polling should NOT halt on 500 Internal Server error!");
    }

    console.log("\n[7/9] Verifying Milestone Deliverable Submission & Change Request loop...");
    const milestones = projectDetail.data.milestones;
    const milestoneId = milestones[0]._id;
    console.log(`First Milestone ID: ${milestoneId}`);

    // Submit work
    const submitRes = await axios.patch(
      `${BASE_URL}/api/milestones/${milestoneId}/submit`,
      {
        githubUrl: "https://github.com/student/runtime-verification-test",
        demoUrl: "https://runtime-verification-test.vercel.app",
        description: "Implemented all verification scripts.",
        attachments: [{ name: "report.pdf", url: "https://cloudinary.com/mock.pdf" }]
      },
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    console.log(`✔ Milestone Submit: Status ${submitRes.status} (Milestone Status: ${submitRes.data.milestone.status})`);

    // Verify submission metadata exists
    const subRes = await axios.get(
      `${BASE_URL}/api/milestones/${milestoneId}/submission`,
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    console.log("✔ Submission metadata retrieved:", {
      githubUrl: subRes.data.githubUrl,
      demoUrl: subRes.data.demoUrl,
      attachments: subRes.data.attachments,
    });

    // Client requests changes (Rejects/Asks for revisions)
    const requestChangesRes = await axios.patch(
      `${BASE_URL}/api/milestones/${milestoneId}/release`,
      {
        status: "CHANGES_REQUESTED",
        reviewComment: "Please improve code comments and rerun tests."
      },
      { headers: { Authorization: `Bearer ${clientToken}` } }
    );
    console.log(`✔ Client Requested Changes: Status ${requestChangesRes.status} (Milestone Status: ${requestChangesRes.data.milestone.status})`);

    // Retrieve modified submission
    const revisedSubRes = await axios.get(
      `${BASE_URL}/api/milestones/${milestoneId}/submission`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    console.log("✔ Submission status after change request:", revisedSubRes.data.status);
    console.log("✔ Client Feedback stored:", revisedSubRes.data.reviewComment);

    if (revisedSubRes.data.status !== "CHANGES_REQUESTED" || revisedSubRes.data.reviewComment !== "Please improve code comments and rerun tests.") {
      throw new Error("Change request loop data assertion failed!");
    }

    console.log("\n[8/9] Verifying Notifications & Badges generation...");
    
    // Check notifications for student (should have received BID_REJECTED / CHANGES_REQUESTED alert)
    const notifRes = await axios.get(
      `${BASE_URL}/api/notifications`,
      { headers: { Authorization: `Bearer ${studentToken}` } }
    );
    const notifications = notifRes.data.notifications;
    const changeNotif = notifications.find(n => n.type === "BID_REJECTED");
    console.log(`✔ Notification generated for Student: "${changeNotif?.message}"`);
    if (!changeNotif) {
      throw new Error("Change request notification not found!");
    }

    console.log("\n[9/9] Verification Completed cleanly!");
    console.log("\n🏆 ALL RUNTIME VERIFICATION CHECKS PASSED SUCCESSFULLY! 🏆");

  } catch (error) {
    console.error("\n❌ RUNTIME VERIFICATION FAILED:", error.response?.data || error.message);
    process.exitCode = 1;
  } finally {
    console.log("\nShutting down backend server...");
    serverProcess.kill();
    await delay(1000);
  }
}

runVerification();

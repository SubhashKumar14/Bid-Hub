import { spawn } from "child_process";
import axios from "axios";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PORT = "5001";
const BASE_URL = `http://localhost:${PORT}`;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTests() {
  console.log("=== Launching Security Hardening & Chat System Test Suite ===");

  // 1. Spawning backend server process on PORT 5001
  console.log(`Starting backend server process on port ${PORT}...`);
  const serverProcess = spawn("node", ["backend/index.js"], {
    env: { ...process.env, PORT, NODE_ENV: "test" },
    shell: true,
  });

  serverProcess.stdout.on("data", (data) => {
    // console.log(`[Server]: ${data.toString().trim()}`);
  });

  serverProcess.stderr.on("data", (data) => {
    console.error(`[Server Error]: ${data.toString().trim()}`);
  });

  // Give server 5 seconds to connect to database and start up
  await delay(5000);

  try {
    const emailSuffix = Math.random().toString(36).substring(2, 7);
    const studentAEmail = `studentA_${emailSuffix}@rvce.edu`;
    const studentBEmail = `studentB_${emailSuffix}@rvce.edu`;
    const clientAEmail = `clientA_${emailSuffix}@rvceinc.com`;

    console.log("\n--- Step 1: Registering Test Profiles ---");
    
    // Register Student A
    const studentARegRes = await axios.post(`${BASE_URL}/api/auth/register`, {
      name: "Student A",
      email: studentAEmail,
      password: "password123",
      role: "student",
      college: "RVCE CS",
    });
    console.log("✔ Student A registered successfully!");
    const studentAToken = studentARegRes.data.token;
    const studentAId = studentARegRes.data._id;

    // Register Student B (Unrelated student)
    const studentBRegRes = await axios.post(`${BASE_URL}/api/auth/register`, {
      name: "Student B",
      email: studentBEmail,
      password: "password123",
      role: "student",
      college: "RVCE IS",
    });
    console.log("✔ Student B registered successfully!");
    const studentBToken = studentBRegRes.data.token;
    const studentBId = studentBRegRes.data._id;

    // Register Client A
    const clientARegRes = await axios.post(`${BASE_URL}/api/auth/register`, {
      name: "Client A",
      email: clientAEmail,
      password: "password123",
      role: "client",
      college: "RVCE Inc.",
    });
    console.log("✔ Client A registered successfully!");
    const clientAToken = clientARegRes.data.token;

    console.log("\n--- Step 2: Client A Posts a Project ---");
    const projectRes = await axios.post(
      `${BASE_URL}/api/projects`,
      {
        title: "Security & Chat Test Project",
        description: "Testing messaging system and helmet security configuration.",
        category: "Web Development",
        budget: "₹15,000",
        deadline: "2026-12-31",
        skillsRequired: ["React", "Express"],
        milestones: [
          { title: "Milestone Chat Demo Checkpoint", amount: "₹15,000", dueDate: "2026-06-30" }
        ],
      },
      {
        headers: { Authorization: `Bearer ${clientAToken}` },
      }
    );
    console.log("✔ Project brief posted successfully!");
    const projectId = projectRes.data._id;

    console.log("\n--- Step 3: Student A Places a Bid & Client Accepts it ---");
    const bidRes = await axios.post(
      `${BASE_URL}/api/projects/${projectId}/bids`,
      {
        amount: "15000",
        timeline: "1 week",
        proposal: "I will implement the messaging and security tests.",
      },
      {
        headers: { Authorization: `Bearer ${studentAToken}` },
      }
    );
    console.log("✔ Student A bid placed successfully!");
    const bidId = bidRes.data._id;

    // Client initiates checkout and simulates payment to lock and assign the project
    const checkoutRes = await axios.post(
      `${BASE_URL}/api/payments/checkout-session`,
      { bidId },
      { headers: { Authorization: `Bearer ${clientAToken}` } }
    );
    const sessionId = checkoutRes.data.sessionId || checkoutRes.data.orderId;
    
    await axios.post(
      `${BASE_URL}/api/payments/simulate-payment`,
      { sessionId }
    );
    console.log("✔ Project assigned to Student A successfully!");

    console.log("\n--- Step 4: Verification of Security Hardening ---");

    // 4.1 Helmet headers validation
    const healthCheckRes = await axios.get(`${BASE_URL}/api/health`);
    console.log("Health check response status:", healthCheckRes.status);
    
    const headers = healthCheckRes.headers;
    const helmetHeaders = [
      "x-content-type-options",
      "x-frame-options",
      "content-security-policy",
      "strict-transport-security",
    ];

    console.log("Verifying Helmet Security Headers:");
    helmetHeaders.forEach((header) => {
      if (headers[header]) {
        console.log(`✔ Header '${header}' is set: ${headers[header]}`);
      } else {
        console.warn(`⚠ Header '${header}' is missing.`);
      }
    });

    if (!headers["x-content-type-options"]) {
      throw new Error("MIME Sniffing protection header (x-content-type-options) is missing!");
    }

    // 4.2 express-mongo-sanitize validation (NoSQL query injection protection)
    console.log("Verifying NoSQL query sanitization...");
    try {
      // Trying login with query injection payload
      await axios.post(`${BASE_URL}/api/auth/login`, {
        email: { "$gt": "" },
        password: "password123"
      });
      // If it returns 200, it means it bypassed email matching! That would be bad.
      throw new Error("NoSQL query injection bypassed database matching!");
    } catch (err) {
      if (err.response && (err.response.status === 401 || err.response.status === 400)) {
        console.log("✔ NoSQL query injection blocked correctly (received status " + err.response.status + ").");
      } else {
        throw new Error("Unexpected response to NoSQL injection: " + (err.response?.status || err.message));
      }
    }

    // 4.3 Rate Limiter validation (Auth attempts threshold = 10)
    console.log("Verifying Auth Rate Limiting (max 10 logins)...");
    let rateLimitBlocked = false;
    for (let i = 0; i < 12; i++) {
      try {
        await axios.post(`${BASE_URL}/api/auth/login`, {
          email: "nonexistent@rvce.edu",
          password: "wrongpassword",
        });
      } catch (err) {
        if (err.response && err.response.status === 429) {
          rateLimitBlocked = true;
          console.log(`✔ Rate limit hit! Attempt #${i+1} returned 429 (Too many requests).`);
          break;
        }
      }
    }

    if (!rateLimitBlocked) {
      throw new Error("Rate limiting did not block repeated auth requests!");
    }

    console.log("\n--- Step 5: Verification of Messaging System ---");

    // 5.1 Student A sends message to Client A (Authorized)
    console.log("Student A sending message to Client A...");
    const msgRes1 = await axios.post(
      `${BASE_URL}/api/messages`,
      { projectId, content: "Hello Client! I am starting work on the project." },
      { headers: { Authorization: `Bearer ${studentAToken}` } }
    );
    console.log("✔ Message sent successfully:", msgRes1.data.content);

    // 5.2 Client A sends message to Student A (Authorized)
    console.log("Client A sending message to Student A...");
    const msgRes2 = await axios.post(
      `${BASE_URL}/api/messages`,
      { projectId, content: "Great to hear! Let me know if you need clarification." },
      { headers: { Authorization: `Bearer ${clientAToken}` } }
    );
    console.log("✔ Reply message sent successfully:", msgRes2.data.content);

    // 5.3 Student B (Unrelated) attempts to send message (Blocked)
    console.log("Student B (unrelated) attempting to send message...");
    try {
      await axios.post(
        `${BASE_URL}/api/messages`,
        { projectId, content: "Bypassing messaging boundary check!" },
        { headers: { Authorization: `Bearer ${studentBToken}` } }
      );
      throw new Error("Messaging RBAC boundary bypassed! Unrelated student was allowed to post a message.");
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log("✔ Messaging blocked correctly for unrelated student (403 Forbidden).");
      } else {
        throw new Error("Unexpected response for unauthorized message post: " + (err.response?.status || err.message));
      }
    }

    // 5.4 Student B attempts to read chat (Blocked)
    console.log("Student B attempting to view chat history...");
    try {
      await axios.get(`${BASE_URL}/api/messages/${projectId}`, {
        headers: { Authorization: `Bearer ${studentBToken}` },
      });
      throw new Error("Messaging RBAC boundary bypassed! Unrelated student was allowed to view chat history.");
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log("✔ Messaging view blocked correctly for unrelated student (403 Forbidden).");
      } else {
        throw new Error("Unexpected response for unauthorized messages read: " + (err.response?.status || err.message));
      }
    }

    // 5.5 Pagination Verification
    console.log("Sending multiple messages from Student A for pagination testing...");
    for (let i = 1; i <= 23; i++) {
      await axios.post(
        `${BASE_URL}/api/messages`,
        { projectId, content: `Message number ${i}` },
        { headers: { Authorization: `Bearer ${studentAToken}` } }
      );
    }
    console.log("Sent 23 additional messages.");

    // Fetch page 1 with limit 10
    console.log("Fetching Page 1 of messages (limit = 10)...");
    const pagRes1 = await axios.get(`${BASE_URL}/api/messages/${projectId}?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${studentAToken}` },
    });
    
    console.log(`✔ Received ${pagRes1.data.messages.length} messages on page 1.`);
    console.log(`Pagination Info: Page ${pagRes1.data.pagination.page} of ${pagRes1.data.pagination.pages}. Total: ${pagRes1.data.pagination.total}`);
    
    if (pagRes1.data.messages.length !== 10) {
      throw new Error(`Expected 10 messages, received ${pagRes1.data.messages.length}`);
    }
    if (pagRes1.data.pagination.total !== 25) { // 2 original + 23 loop = 25
      throw new Error(`Expected 25 total messages, found ${pagRes1.data.pagination.total}`);
    }

    // Fetch page 3 with limit 10
    console.log("Fetching Page 3 of messages (limit = 10)...");
    const pagRes3 = await axios.get(`${BASE_URL}/api/messages/${projectId}?page=3&limit=10`, {
      headers: { Authorization: `Bearer ${studentAToken}` },
    });
    console.log(`✔ Received ${pagRes3.data.messages.length} messages on page 3.`);
    
    if (pagRes3.data.messages.length !== 5) { // 25 total / limit 10: page 1 = 10, page 2 = 10, page 3 = 5
      throw new Error(`Expected 5 messages on page 3, received ${pagRes3.data.messages.length}`);
    }

    console.log("\n🏆 ALL SECURITY AND CHAT SYSTEM INTEGRATION TESTS PASSED SUCCESSFULLY! 🏆");
  } catch (error) {
    console.error("\n❌ TEST FAILED:", error.response?.data?.message || error.message);
    process.exitCode = 1;
  } finally {
    console.log("Shutting down test backend server...");
    serverProcess.kill();
    // Allow process to terminate cleanly
    await delay(1000);
  }
}

runTests();

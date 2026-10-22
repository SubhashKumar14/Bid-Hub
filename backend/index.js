import { httpErrorStatus } from "./lib/validation.js";
import mongoose from "mongoose";
import { User } from "./models/User.js";
import { PaymentEvent } from "./models/PaymentEvent.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import helmet from "helmet";
import mongoSanitize from "express-mongo-sanitize";
import rateLimit from "express-rate-limit";
import { connectDB } from "./config/db.js";
import { Activity } from "./models/Activity.js";
import { getPaymentProvider } from "./payments/index.js";


// Load environment variables
const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(currentDir, ".env") });

// === Env validation: fail fast if critical vars missing ===
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith("replace_with_") || process.env.JWT_SECRET.length < 32) {
  console.error("FATAL CONFIGURATION ERROR: Set a stable JWT_SECRET of at least 32 characters before starting BidHub.");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.error("FATAL CONFIGURATION ERROR: Set MONGODB_URI before starting BidHub.");
  process.exit(1);
}

try {
  getPaymentProvider();
} catch (err) {
  console.error("\n========================================================");
  console.error("FATAL CONFIGURATION ERROR:");
  console.error(err.message);
  console.error("========================================================\n");
  process.exit(1);
}

// Connect to Database
await connectDB();
await PaymentEvent.init();

const app = express();

// Global Security Headers
app.use(helmet());

// Rate Limit Write/Modifying actions (POST, PATCH, PUT, DELETE)
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 120, // 120 writes per 15 mins
  message: { message: "Too many write requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate Limit Upload requests
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 50, // 50 uploads per 15 mins
  message: { message: "Too many upload requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Messaging write rates
const messageWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "test" ? 1000 : 300, // 300 messages per 15 mins
  message: { message: "Too many messages sent. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Exclude GET requests from global strict limiting to prevent polling 429 lockouts
const apiLimiter = (req, res, next) => {
  if (req.path === "/api/payments/webhook") return next();
  if (req.method === "GET") {
    return next();
  }
  // Exclude login and register which have their own authLimiter in routes/auth.js
  if (req.path.startsWith("/api/auth/login") || req.path.startsWith("/api/auth/register")) {
    return next();
  }
  // Exclude import routes which have importLimiter in routes/imports.js
  if (req.path.startsWith("/api/import")) {
    return next();
  }
  if (req.path.startsWith("/api/uploads")) {
    return uploadLimiter(req, res, next);
  }
  if (req.path.startsWith("/api/messages") && req.method === "POST") {
    return messageWriteLimiter(req, res, next);
  }
  return writeLimiter(req, res, next);
};

app.use(apiLimiter);

// === CORS: restrict to CLIENT_URL in production ===
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:5173",
  "http://localhost:5173",
  "http://localhost:5174",
];
// Also allow Vercel preview URLs
if (process.env.VERCEL_URL) {
  allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
}

if (process.env.SOCKET_CORS_ORIGIN) {
  process.env.SOCKET_CORS_ORIGIN.split(",").forEach((origin) => {
    allowedOrigins.push(origin.trim());
  });
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman, Render health checks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error(`CORS: Origin '${origin}' not allowed.`));
    },
    credentials: true,
  })
);

// Razorpay webhook requires raw body for signature verification
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(mongoSanitize());

// Serve static upload folder (local fallback)
const __dirname = path.resolve();
app.use("/uploads", async (req, res, next) => {
  try {
    if (!(await User.exists({ avatarUrl: `/uploads${req.path}` }))) return res.status(404).end();
    next();
  } catch (error) { next(error); }
}, express.static(path.join(__dirname, "uploads")));

// Import Routers
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import projectsRouter from "./routes/projects.js";
import bidsRouter from "./routes/bids.js";
import milestonesRouter from "./routes/milestones.js";
import paymentsRouter from "./routes/payments.js";
import reviewsRouter from "./routes/reviews.js";
import uploadsRouter from "./routes/uploads.js";
import importsRouter from "./routes/imports.js";
import notificationsRouter from "./routes/notifications.js";
import messagesRouter from "./routes/messages.js";

// Mount Routers
app.use("/api/auth", authRouter);
app.use("/api/users", usersRouter);
app.use("/api/projects", projectsRouter);
app.use("/api", bidsRouter); // Handles /api/projects/:id/bids, /api/bids/:id/accept, /api/bids/:id/reject
app.use("/api/milestones", milestonesRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/reviews", reviewsRouter);
app.use("/api/uploads", uploadsRouter);
app.use("/api/import", importsRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/messages", messagesRouter);

// Global Activity Feed endpoint
app.get("/api/activities", async (req, res) => {
  try {
    const activities = await Activity.find({ type: { $in: ["PROJECT_POSTED", "PROJECT_COMPLETED"] } })
      .populate("actorId", "name avatarUrl college role")
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(activities);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch activity feed." });
  }
});

// Health check endpoint — used by Render, uptime monitors, and load balancers
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    version: "1.0.0",
  });
});

app.get("/api/ready", (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ ready });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({ message: "Bid-Hub API is running.", status: "ok" });
});

// === Global error handler — never expose stack traces in production ===
app.use((err, req, res, next) => {
  const statusCode = httpErrorStatus(err);
  console.error(err);
  res.status(statusCode).json({
    message: err.message || "Internal server error.",
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Bid-Hub API server running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
});

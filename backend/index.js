import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "./config/db.js";
import { Activity } from "./models/Activity.js";

// Load environment variables
dotenv.config();

// === Env validation: fail fast if critical vars missing ===
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "replace_with_a_long_random_secret_key") {
  console.error("FATAL: JWT_SECRET is not set or is using the default placeholder. Set a strong secret in .env before running.");
  process.exit(1);
}
if (!process.env.MONGODB_URI) {
  console.warn("WARNING: MONGODB_URI is not set. Using local mongodb://localhost:27017/bidhub");
}

// Connect to Database
connectDB();

const app = express();

// === CORS: restrict to CLIENT_URL in production ===
const allowedOrigins = [
  process.env.CLIENT_URL || "http://localhost:5173",
];
// Also allow Vercel preview URLs
if (process.env.VERCEL_URL) {
  allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman, Render health checks)
      if (!origin) return callback(null, true);
      if (allowedOrigins.some((allowed) => origin.startsWith(allowed))) {
        return callback(null, true);
      }
      callback(new Error(`CORS: Origin '${origin}' not allowed.`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve static upload folder (local fallback)
const __dirname = path.resolve();
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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

// Global Activity Feed endpoint
app.get("/api/activities", async (req, res) => {
  try {
    const activities = await Activity.find()
      .populate("actorId", "name avatarUrl college role")
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(activities);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch activity feed." });
  }
});

// Root health check endpoint
app.get("/", (req, res) => {
  res.json({ message: "Bid-Hub API is running.", status: "ok" });
});

// === Global error handler — never expose stack traces in production ===
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
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

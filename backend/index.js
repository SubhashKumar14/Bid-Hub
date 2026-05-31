import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { connectDB } from "./config/db.js";
import { Activity } from "./models/Activity.js";

// Load environment variables
dotenv.config();

// Connect to Database
connectDB();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static upload folder
const __dirname = path.resolve();
app.use("/uploads", express.static(path.join(__dirname, "server/uploads")));

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
app.use("/api", bidsRouter); // Handles accepts and nested project bids
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
    res.status(500).json({ message: error.message });
  }
});

// Root check endpoint
app.get("/", (req, res) => {
  res.json({ message: "Bid-Hub MERN API Server is running." });
});

// Error handling middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

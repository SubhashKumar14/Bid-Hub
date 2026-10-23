import { httpErrorStatus } from "../lib/validation.js";
import express from "express";
import { createRouter } from "../lib/router.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { User } from "../models/User.js";
import { protect } from "../middleware/auth.js";

// Rate limit: max 10 auth attempts per 15 minutes per IP (relaxed in test/CI/demo environments)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.AUTH_RATE_LIMIT
    ? parseInt(process.env.AUTH_RATE_LIMIT, 10)
    : (process.env.NODE_ENV === "test" || process.env.CI || process.env.PRODUCT_MODE === "demo" ? 1000 : 10),
  message: { message: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = createRouter();

const generateToken = (id) => {
  // JWT_SECRET is validated on startup — no fallback here
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "1d",
  });
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
router.post("/register", authLimiter, async (req, res) => {
  const { name, email, password, role, college } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: "Please provide name, email, password, and role." });
  }

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof role !== "string" ||
    (college && typeof college !== "string")
  ) {
    return res.status(400).json({ message: "Invalid field formats. All inputs must be strings." });
  }

  const allowedRoles = ["student", "client"];
  if (!allowedRoles.includes(role)) {
    return res.status(400).json({ message: "Role must be either 'student' or 'client'." });
  }

  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: "Use a valid email and a password of at least 8 characters and at most 72 UTF-8 bytes." });
  }

  try {
    const userExists = await User.findOne({ email: email.toLowerCase().trim() });

    if (userExists) {
      return res.status(400).json({ message: "An account with this email already exists." });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      role,
      college: college?.trim() || "",
    });

    if (user) {
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        college: user.college,
        token: generateToken(user._id),
      });
    } else {
      res.status(400).json({ message: "Invalid user data. Please try again." });
    }
  } catch (error) {
    console.error("Register error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Registration failed. Please try again." });
  }
});

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Please provide email and password." });
  }

  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "Invalid email or password format." });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (user && (await bcrypt.compare(password, user.passwordHash))) {
      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        college: user.college,
        avatarUrl: user.avatarUrl,
        token: generateToken(user._id),
      });
    } else {
      res.status(401).json({ message: "Invalid email or password." });
    }
  } catch (error) {
    console.error("Login error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Login failed. Please try again." });
  }
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
router.get("/me", protect, async (req, res) => {
  try {
    res.json(req.user);
  } catch (error) {
    res.status(httpErrorStatus(error)).json({ message: "Failed to fetch user profile." });
  }
});

export default router;

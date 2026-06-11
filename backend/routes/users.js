import express from "express";
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { Review } from "../models/Review.js";
import { protect } from "../middleware/auth.js";
import { upload } from "../config/cloudinary.js";

const router = express.Router();

// @desc    Get user profile details & reviews
// @route   GET /api/users/:id
// @access  Public
router.get("/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-passwordHash");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    let isSelf = false;
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
      try {
        const token = req.headers.authorization.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded && decoded.id === req.params.id) {
          isSelf = true;
        }
      } catch (err) {
        // ignore malformed or expired token for views increment
      }
    }

    // Increment profile views only if not self-visiting
    if (!isSelf) {
      user.profileViews = (user.profileViews || 0) + 1;
      await user.save();
    }

    // Fetch user reviews (where user is the reviewee)
    const reviews = await Review.find({ revieweeId: req.params.id })
      .populate("reviewerId", "name avatarUrl college")
      .populate("projectId", "title");

    res.json({ user, reviews });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Update user profile
// @route   PATCH /api/users/:id
// @access  Private
router.patch("/:id", protect, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if updating own profile
    if (user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to update this profile" });
    }

    const { name, bio, skills, college } = req.body;

    if (name) user.name = name;
    if (bio !== undefined) user.bio = bio;
    if (skills) user.skills = skills;
    if (college) user.college = college;

    const updatedUser = await user.save();
    res.json(updatedUser);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Upload avatar
// @route   POST /api/users/avatar
// @access  Private
router.post("/avatar", protect, upload.single("avatar"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "Please upload a file" });
    }

    let url;
    if (req.file.path) {
      url = req.file.path; // Cloudinary storage path contains URL
    } else {
      url = `/uploads/${req.file.filename}`; // Local filesystem fallback URL
    }

    // Check if cloud URL is stored in path directly, or we construct local
    if (!url.startsWith("http") && !url.startsWith("/uploads/")) {
      url = `/uploads/${req.file.filename}`;
    }

    // Update user avatarUrl
    const user = await User.findById(req.user._id);
    user.avatarUrl = url;
    await user.save();

    res.json({ message: "Avatar uploaded successfully", avatarUrl: url });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

import express from "express";
import { Review } from "../models/Review.js";
import { Project } from "../models/Project.js";
import { User } from "../models/User.js";
import { Activity } from "../models/Activity.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// @desc    Submit a review after project completion
// @route   POST /api/reviews
// @access  Private
router.post("/", protect, async (req, res) => {
  const { projectId, revieweeId, rating, comment } = req.body;

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found" });
    }

    if (project.status !== "COMPLETED") {
      return res.status(400).json({ message: "Reviews can only be submitted for completed projects" });
    }

    // Verify reviewer is project client or student
    const isClient = project.clientId.toString() === req.user._id.toString();
    
    // Fetch project bids to find the accepted student
    const bids = await Review.db.model("Bid").find({ projectId, status: "ACCEPTED" });
    const isStudent = bids.some(b => b.studentId.toString() === req.user._id.toString());

    if (!isClient && !isStudent) {
      return res.status(403).json({ message: "Access denied. You did not participate in this project" });
    }

    // Verify reviewee was part of the project
    const isRevieweeClient = project.clientId.toString() === revieweeId.toString();
    const isRevieweeStudent = bids.some(b => b.studentId.toString() === revieweeId.toString());

    if (!isRevieweeClient && !isRevieweeStudent) {
      return res.status(400).json({ message: "The reviewee did not participate in this project" });
    }

    // Check if review already exists from this user
    const existingReview = await Review.findOne({
      projectId,
      reviewerId: req.user._id,
    });

    if (existingReview) {
      return res.status(400).json({ message: "You have already reviewed this project" });
    }

    const review = await Review.create({
      projectId,
      reviewerId: req.user._id,
      revieweeId,
      rating,
      comment,
    });

    // Recalculate average rating of reviewee
    const allReviews = await Review.find({ revieweeId });
    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
    const avgRating = totalRating / allReviews.length;

    await User.findByIdAndUpdate(revieweeId, {
      rating: parseFloat(avgRating.toFixed(2)),
    });

    // Log Activity
    await Activity.create({
      actorId: req.user._id,
      type: "REVIEW_SUBMITTED",
      message: `${req.user.name} submitted a ${rating}-star review for project "${project.title}"`,
      targetId: project._id,
    });

    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Get reviews for a user
// @route   GET /api/users/:id/reviews
// @access  Public
router.get("/users/:id/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({ revieweeId: req.params.id })
      .populate("reviewerId", "name avatarUrl college role")
      .populate("projectId", "title")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

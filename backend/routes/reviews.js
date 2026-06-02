import express from "express";
import { Review } from "../models/Review.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { User } from "../models/User.js";
import { Activity } from "../models/Activity.js";
import { Notification } from "../models/Notification.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// @desc    Submit a review after project completion
// @route   POST /api/reviews
// @access  Private
router.post("/", protect, async (req, res) => {
  const { projectId, revieweeId, rating, comment } = req.body;

  if (!projectId || !revieweeId || !rating) {
    return res.status(400).json({ message: "Project, reviewee, and rating are required." });
  }

  const numRating = Number(rating);
  if (isNaN(numRating) || numRating < 1 || numRating > 5) {
    return res.status(400).json({ message: "Rating must be a number between 1 and 5." });
  }

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    if (project.status !== "COMPLETED") {
      return res.status(400).json({ message: "Reviews can only be submitted after a project is completed." });
    }

    // Verify reviewer is project client or the assigned student
    const isClient = project.clientId.toString() === req.user._id.toString();

    // Use imported Bid model — not the hack with db.model()
    const acceptedBids = await Bid.find({ projectId, status: "ACCEPTED" });
    const isStudent = acceptedBids.some(
      (b) => b.studentId.toString() === req.user._id.toString()
    );

    if (!isClient && !isStudent) {
      return res.status(403).json({ message: "Only verified participants of this project can leave a review." });
    }

    // Verify reviewee was part of the project
    const isRevieweeClient = project.clientId.toString() === revieweeId.toString();
    const isRevieweeStudent = acceptedBids.some(
      (b) => b.studentId.toString() === revieweeId.toString()
    );

    if (!isRevieweeClient && !isRevieweeStudent) {
      return res.status(400).json({ message: "The person you are reviewing did not participate in this project." });
    }

    // Prevent reviewer from reviewing themselves
    if (req.user._id.toString() === revieweeId.toString()) {
      return res.status(400).json({ message: "You cannot review yourself." });
    }

    // Check if review already exists from this user for this project
    const existingReview = await Review.findOne({
      projectId,
      reviewerId: req.user._id,
    });

    if (existingReview) {
      return res.status(400).json({ message: "You have already submitted a review for this project." });
    }

    const review = await Review.create({
      projectId,
      reviewerId: req.user._id,
      revieweeId,
      rating: numRating,
      comment: comment?.trim() || "",
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
      message: `${req.user.name} submitted a ${numRating}-star review for project "${project.title}"`,
      targetId: project._id,
    });

    // Notify the person being reviewed
    await Notification.create({
      recipientId: revieweeId,
      type: "REVIEW_RECEIVED",
      message: `${req.user.name} left you a ${numRating}-star review for project "${project.title}".`,
      targetId: project._id,
    });

    res.status(201).json(review);
  } catch (error) {
    console.error("Submit review error:", error);
    res.status(500).json({ message: "Failed to submit review. Please try again." });
  }
});

// @desc    Get reviews for a user
// @route   GET /api/reviews/users/:id/reviews
// @access  Public
router.get("/users/:id/reviews", async (req, res) => {
  try {
    const reviews = await Review.find({ revieweeId: req.params.id })
      .populate("reviewerId", "name avatarUrl college role")
      .populate("projectId", "title")
      .sort({ createdAt: -1 });
    res.json(reviews);
  } catch (error) {
    console.error("Get reviews error:", error);
    res.status(500).json({ message: "Failed to fetch reviews. Please try again." });
  }
});

export default router;

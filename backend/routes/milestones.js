import express from "express";
import { Milestone } from "../models/Milestone.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { User } from "../models/User.js";
import { Activity } from "../models/Activity.js";
import { Notification } from "../models/Notification.js";
import { protect, requireRole } from "../middleware/auth.js";
import { MilestoneSubmission } from "../models/MilestoneSubmission.js";

const router = express.Router();

const parseAmount = (val) => {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const cleaned = val.toString().replace(/[₹$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};


// @desc    Submit milestone work (Student)
// @route   PATCH /api/milestones/:id/submit
// @access  Private (Student only)
router.patch("/:id/submit", protect, requireRole("student"), async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found." });
    }

    const project = await Project.findById(milestone.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Verify student is the accepted bidder
    const acceptedBid = await Bid.findById(project.acceptedBidId);
    if (!acceptedBid || acceptedBid.studentId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not assigned to this project." });
    }

    if (milestone.status === "RELEASED") {
      return res.status(400).json({ message: "This milestone is already complete." });
    }

    const { githubUrl, demoUrl, videoUrl, description, attachments } = req.body;

    if (!githubUrl || !githubUrl.trim()) {
      return res.status(400).json({ message: "GitHub Repository URL is required." });
    }
    if (!githubUrl.startsWith("http") || !githubUrl.includes("github.com")) {
      return res.status(400).json({ message: "Please provide a valid GitHub repository URL." });
    }

    if (!demoUrl || !demoUrl.trim() || !demoUrl.startsWith("http")) {
      return res.status(400).json({ message: "Please provide a valid Live Demo URL (starting with http/https)." });
    }

    if (!videoUrl || !videoUrl.trim() || !videoUrl.startsWith("http")) {
      return res.status(400).json({ message: "Please provide a valid Demo Video URL (starting with http/https)." });
    }

    if (!description || description.trim().length < 10) {
      return res.status(400).json({ message: "Submission Notes are required and must be at least 10 characters long." });
    }

    let submission = await MilestoneSubmission.findOne({ milestoneId: milestone._id });
    if (submission) {
      submission.githubUrl = githubUrl.trim();
      submission.demoUrl = demoUrl.trim();
      submission.videoUrl = videoUrl.trim();
      submission.description = description.trim();
      submission.attachments = attachments || [];
      submission.status = "SUBMITTED";
      submission.reviewComment = "";
      await submission.save();
    } else {
      submission = await MilestoneSubmission.create({
        milestoneId: milestone._id,
        submittedBy: req.user._id,
        githubUrl: githubUrl.trim(),
        demoUrl: demoUrl.trim(),
        videoUrl: videoUrl.trim(),
        description: description.trim(),
        attachments: attachments || [],
        status: "SUBMITTED",
      });
    }

    milestone.status = "SUBMITTED";
    await milestone.save();

    // Update escrow ledger status
    await PaymentLedger.updateOne(
      { milestoneId: milestone._id },
      { status: "PENDING_REVIEW" }
    );

    // Log Activity
    await Activity.create({
      actorId: req.user._id,
      type: "MILESTONE_SUBMITTED",
      message: `${req.user.name} submitted milestone work: "${milestone.title}"`,
      targetId: project._id,
    });

    // Notify client that milestone work is ready for review
    await Notification.create({
      recipientId: project.clientId,
      type: "MILESTONE_SUBMITTED",
      message: `${req.user.name} submitted work for milestone "${milestone.title}" — ready for your review.`,
      targetId: project._id,
    });

    res.json({ message: "Milestone submitted for client review.", milestone });
  } catch (error) {
    console.error("Submit milestone error:", error);
    res.status(500).json({ message: "Failed to submit milestone. Please try again." });
  }
});

// @desc    Approve/Release milestone funds (Client)
// @route   PATCH /api/milestones/:id/release
// @access  Private (Client only)
router.patch("/:id/release", protect, requireRole("client"), async (req, res) => {
  const { status, reviewComment } = req.body;

  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found." });
    }

    const project = await Project.findById(milestone.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Verify client ownership
    if (project.clientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not the client for this project." });
    }

    // Handle CHANGES_REQUESTED
    if (status === "CHANGES_REQUESTED") {
      if (!reviewComment || !reviewComment.trim()) {
        return res.status(400).json({ message: "Review comment/feedback is required to request changes." });
      }

      // Update milestone status back to CHANGES_REQUESTED
      const updatedMilestone = await Milestone.findOneAndUpdate(
        { _id: req.params.id, status: "SUBMITTED" },
        { status: "CHANGES_REQUESTED" },
        { new: true }
      );

      if (!updatedMilestone) {
        return res.status(400).json({
          message: "Cannot request changes. Milestone is not in SUBMITTED state.",
        });
      }

      // Update MilestoneSubmission status
      await MilestoneSubmission.findOneAndUpdate(
        { milestoneId: milestone._id, status: "SUBMITTED" },
        { status: "CHANGES_REQUESTED", reviewComment: reviewComment.trim() }
      );

      // Revert PaymentLedger back to LOCKED
      await PaymentLedger.updateOne(
        { milestoneId: milestone._id },
        { status: "LOCKED" }
      );

      // Log Activity
      await Activity.create({
        actorId: req.user._id,
        type: "MILESTONE_RELEASED",
        message: `${req.user.name} requested changes for milestone: "${milestone.title}"`,
        targetId: project._id,
      });

      // Notify Student
      const acceptedBid = await Bid.findById(project.acceptedBidId);
      if (acceptedBid) {
        await Notification.create({
          recipientId: acceptedBid.studentId,
          type: "MILESTONE_CHANGES_REQUESTED",
          message: `Changes requested on milestone "${milestone.title}" for project "${project.title}": ${reviewComment}`,
          targetId: project._id,
        });
      }

      return res.json({ message: "Changes requested successfully.", milestone: updatedMilestone });
    }

    // Default: APPROVED / RELEASED
    // Atomic update to prevent duplicate release race conditions
    const updatedMilestone = await Milestone.findOneAndUpdate(
      { _id: req.params.id, status: "SUBMITTED" },
      { status: "RELEASED" },
      { new: true }
    );

    if (!updatedMilestone) {
      return res.status(400).json({
        message: "Milestone funds cannot be released. Either it is already released or has not been submitted yet.",
      });
    }

    // Update MilestoneSubmission to APPROVED
    await MilestoneSubmission.findOneAndUpdate(
      { milestoneId: milestone._id, status: "SUBMITTED" },
      { status: "APPROVED" }
    );

    // Update escrow ledger entry (simulate Razorpay Connect/Payout transfer to student connected account)
    const mockTransferId = "tr_mock_" + Math.random().toString(36).substring(2, 12);
    const ledger = await PaymentLedger.findOneAndUpdate(
      { milestoneId: milestone._id, status: { $in: ["LOCKED", "PENDING_REVIEW"] } },
      {
        status: "RELEASED",
        stripeTransferId: mockTransferId,
        releasedAt: new Date(),
      },
      { new: true }
    );

    // Log Activity
    await Activity.create({
      actorId: req.user._id,
      type: "MILESTONE_RELEASED",
      message: `${req.user.name} released funds for milestone: "${milestone.title}"`,
      targetId: project._id,
    });

    // Check if ALL milestones for this project are released
    const remainingMilestones = await Milestone.find({
      projectId: project._id,
      status: { $ne: "RELEASED" },
    });

    if (remainingMilestones.length === 0) {
      // Complete Project
      project.status = "COMPLETED";
      await project.save();

      // Find assigned student to increment completed projects count
      const acceptedBid = await Bid.findById(project.acceptedBidId);
      if (acceptedBid) {
        const student = await User.findById(acceptedBid.studentId);
        if (student) {
          student.completedProjects = (student.completedProjects || 0) + 1;
          await student.save();
        }

        // Notify both student and client of project completion
        await Notification.create({
          recipientId: acceptedBid.studentId,
          type: "PROJECT_COMPLETED",
          message: `Congratulations! Project "${project.title}" has been completed. All escrow funds have been released.`,
          targetId: project._id,
        });
      }

      await Notification.create({
        recipientId: project.clientId,
        type: "PROJECT_COMPLETED",
        message: `Project "${project.title}" is complete. You can now leave a review for the student.`,
        targetId: project._id,
      });

      // Log Project Completed Activity
      await Activity.create({
        actorId: req.user._id,
        type: "PROJECT_COMPLETED",
        message: `Project "${project.title}" has been successfully completed!`,
        targetId: project._id,
      });
    } else {
      // Notify student that a milestone was released (funds available)
      const acceptedBid = await Bid.findById(project.acceptedBidId);
      if (acceptedBid) {
        await Notification.create({
          recipientId: acceptedBid.studentId,
          type: "MILESTONE_RELEASED",
          message: `Escrow funds released for milestone "${milestone.title}" on project "${project.title}".`,
          targetId: project._id,
        });
      }
    }

    res.json({ message: "Milestone funds released successfully.", milestone: updatedMilestone, project });
  } catch (error) {
    console.error("Release milestone error:", error);
    res.status(500).json({ message: "Failed to release milestone funds. Please try again." });
  }
});

// @desc    Get latest submission for a milestone
// @route   GET /api/milestones/:id/submission
// @access  Private (Client or Assigned Student only)
router.get("/:id/submission", protect, async (req, res) => {
  try {
    const milestone = await Milestone.findById(req.params.id);
    if (!milestone) {
      return res.status(404).json({ message: "Milestone not found." });
    }

    const project = await Project.findById(milestone.projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Verify authorized user
    const acceptedBid = await Bid.findById(project.acceptedBidId);
    const isStudent = acceptedBid && acceptedBid.studentId.toString() === req.user._id.toString();
    const isClient = project.clientId.toString() === req.user._id.toString();

    if (!isStudent && !isClient) {
      return res.status(403).json({ message: "Not authorized to view this milestone's submissions." });
    }

    const submission = await MilestoneSubmission.findOne({ milestoneId: req.params.id })
      .populate("submittedBy", "name avatarUrl");

    res.json(submission || null);
  } catch (error) {
    console.error("Get milestone submission error:", error);
    res.status(500).json({ message: "Failed to load milestone submission." });
  }
});


export default router;

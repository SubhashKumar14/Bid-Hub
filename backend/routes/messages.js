import express from "express";
import { Message } from "../models/Message.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Notification } from "../models/Notification.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// @desc    Send a message
// @route   POST /api/messages
// @access  Private (Client or Accepted Student only)
router.post("/", protect, async (req, res) => {
  const { projectId, content } = req.body;

  if (!projectId || !content || !content.trim()) {
    return res.status(400).json({ message: "Project ID and content are required." });
  }

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Enforce project is ASSIGNED, IN_PROGRESS, or COMPLETED
    const allowedStatuses = ["ASSIGNED", "IN_PROGRESS", "COMPLETED"];
    if (!allowedStatuses.includes(project.status)) {
      return res.status(400).json({ message: "Messaging is only allowed on active or completed projects." });
    }

    // Get accepted bid to find the student
    if (!project.acceptedBidId) {
      return res.status(403).json({ message: "No accepted student found for this project." });
    }

    const bid = await Bid.findById(project.acceptedBidId);
    if (!bid) {
      return res.status(403).json({ message: "No accepted student found for this project." });
    }

    const isStudent = bid.studentId.toString() === req.user._id.toString();
    const isClient = project.clientId.toString() === req.user._id.toString();

    if (!isStudent && !isClient) {
      return res.status(403).json({ message: "You are not authorized to message on this project." });
    }

    // Determine recipientId
    const recipientId = isClient ? bid.studentId : project.clientId;

    const message = await Message.create({
      projectId,
      senderId: req.user._id,
      recipientId,
      content: content.trim(),
    });

    // Populate sender details for immediate frontend state update
    const populatedMessage = await Message.findById(message._id)
      .populate("senderId", "name avatarUrl role");

    // Send notification to recipient
    await Notification.create({
      recipientId,
      type: "MESSAGE_RECEIVED",
      message: `New message on "${project.title}" from ${req.user.name}`,
      targetId: project._id,
    });

    res.status(201).json(populatedMessage);
  } catch (error) {
    console.error("Post message error:", error);
    res.status(500).json({ message: "Failed to send message." });
  }
});

// @desc    Get paginated messages for a project
// @route   GET /api/messages/:projectId
// @access  Private (Client or Accepted Student only)
router.get("/:projectId", protect, async (req, res) => {
  const { projectId } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  try {
    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: "Project not found." });
    }

    // Enforce project is ASSIGNED, IN_PROGRESS, or COMPLETED
    const allowedStatuses = ["ASSIGNED", "IN_PROGRESS", "COMPLETED"];
    if (!allowedStatuses.includes(project.status)) {
      return res.status(400).json({ message: "Messaging is only allowed on active or completed projects." });
    }

    if (!project.acceptedBidId) {
      return res.status(403).json({ message: "No accepted student found for this project." });
    }

    const bid = await Bid.findById(project.acceptedBidId);
    if (!bid) {
      return res.status(403).json({ message: "No accepted student found for this project." });
    }

    const isStudent = bid.studentId.toString() === req.user._id.toString();
    const isClient = project.clientId.toString() === req.user._id.toString();

    if (!isStudent && !isClient) {
      return res.status(403).json({ message: "You are not authorized to view messages on this project." });
    }

    const messages = await Message.find({ projectId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("senderId", "name avatarUrl role");

    const total = await Message.countDocuments({ projectId });

    res.json({
      messages: messages.reverse(), // Reverse to display oldest to newest in chat UI
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Get messages error:", error);
    res.status(500).json({ message: "Failed to fetch messages." });
  }
});

export default router;

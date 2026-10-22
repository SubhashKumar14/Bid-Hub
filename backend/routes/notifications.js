import { httpErrorStatus } from "../lib/validation.js";
import express from "express";
import { createRouter } from "../lib/router.js";
import { Notification } from "../models/Notification.js";
import { protect } from "../middleware/auth.js";

const router = createRouter();

// @desc    Get all notifications for current user (newest first)
// @route   GET /api/notifications
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const unreadCount = await Notification.countDocuments({ recipientId: req.user._id, read: false });

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to fetch notifications." });
  }
});

// @desc    Mark a single notification as read
// @route   PATCH /api/notifications/:id/read
// @access  Private
router.patch("/:id/read", protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user._id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    res.json({ message: "Notification marked as read.", notification });
  } catch (error) {
    console.error("Mark notification read error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to update notification." });
  }
});

// @desc    Mark ALL notifications as read
// @route   PATCH /api/notifications/read-all
// @access  Private
router.patch("/read-all", protect, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { recipientId: req.user._id, read: false },
      { read: true }
    );

    res.json({ message: `${result.modifiedCount} notifications marked as read.` });
  } catch (error) {
    console.error("Mark all notifications read error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to update notifications." });
  }
});



export default router;

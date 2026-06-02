import express from "express";
import { Notification } from "../models/Notification.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// @desc    Get all notifications for current user (newest first)
// @route   GET /api/notifications
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();

    const unreadCount = notifications.filter((n) => !n.read).length;

    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error("Get notifications error:", error);
    res.status(500).json({ message: "Failed to fetch notifications." });
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
    res.status(500).json({ message: "Failed to update notification." });
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
    res.status(500).json({ message: "Failed to update notifications." });
  }
});

// @desc    Get unread notification count (for badge)
// @route   GET /api/notifications/unread-count
// @access  Private
router.get("/unread-count", protect, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipientId: req.user._id,
      read: false,
    });
    res.json({ unreadCount: count });
  } catch (error) {
    console.error("Unread count error:", error);
    res.status(500).json({ message: "Failed to fetch notification count." });
  }
});

// @desc    Delete a notification
// @route   DELETE /api/notifications/:id
// @access  Private
router.delete("/:id", protect, async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipientId: req.user._id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found." });
    }

    res.json({ message: "Notification deleted." });
  } catch (error) {
    console.error("Delete notification error:", error);
    res.status(500).json({ message: "Failed to delete notification." });
  }
});

export default router;

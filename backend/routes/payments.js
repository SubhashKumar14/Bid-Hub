import express from "express";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// @desc    Get user payment ledger stats & transactions
// @route   GET /api/payments
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch all transactions involving this user
    const transactions = await PaymentLedger.find({
      $or: [{ clientId: userId }, { studentId: userId }],
    })
      .populate("projectId", "title")
      .populate("milestoneId", "title")
      .sort({ updatedAt: -1 });

    // Compute stats
    let lockedAmount = 0;
    let pendingAmount = 0;
    let releasedAmount = 0;

    transactions.forEach((tx) => {
      if (tx.status === "LOCKED") {
        lockedAmount += tx.amount;
      } else if (tx.status === "PENDING") {
        pendingAmount += tx.amount;
      } else if (tx.status === "RELEASED") {
        releasedAmount += tx.amount;
      }
    });

    res.json({
      stats: {
        lockedAmount,
        pendingAmount,
        releasedAmount,
      },
      transactions,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;

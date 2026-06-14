import express from "express";
import { getPaymentProvider, getActiveProviderName } from "../payments/index.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Milestone } from "../models/Milestone.js";
import { Activity } from "../models/Activity.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { protect, requireRole } from "../middleware/auth.js";

const router = express.Router();

// Helper to generate transaction reference
const genTxnRef = () =>
  "TXN-" +
  Math.random().toString(36).substring(2, 7).toUpperCase() +
  Math.random().toString(36).substring(2, 7).toUpperCase();

// Helper to parse numeric amount safely from a string or number
const parseAmount = (amountVal) => {
  if (typeof amountVal === "number") return amountVal;
  return parseFloat(String(amountVal).replace(/[^0-9.]/g, "")) || 0;
};

// @desc    Initiate payment checkout session or order (Escrow Deposit)
// @route   POST /api/payments/checkout-session
// @access  Private (Client only)
router.post("/checkout-session", protect, requireRole("client"), async (req, res) => {
  const { bidId } = req.body;

  if (!bidId) {
    return res.status(400).json({ message: "Bid ID is required." });
  }

  try {
    const bid = await Bid.findById(bidId).populate("studentId", "name");
    if (!bid) {
      return res.status(404).json({ message: "Bid not found." });
    }

    // Atomic update to transition project to PENDING_FUNDING
    const project = await Project.findOneAndUpdate(
      { _id: bid.projectId, clientId: req.user._id, status: { $in: ["OPEN", "PENDING_FUNDING"] } },
      { status: "PENDING_FUNDING" },
      { new: true }
    );

    if (!project) {
      return res.status(400).json({ message: "Project is not open or you are not authorized." });
    }

    const numericAmount = parseAmount(bid.amount);
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    // Invalidate previous checkout attempts by marking them as FAILED
    await PaymentLedger.updateMany(
      { projectId: project._id, status: "PENDING_CHECKOUT" },
      { status: "FAILED" }
    );

    const provider = getPaymentProvider();
    const checkoutData = await provider.createCheckout(project, bid, numericAmount, clientUrl);

    res.json(checkoutData);
  } catch (error) {
    console.error("Escrow checkout initiation error:", error);
    res.status(500).json({ message: "Failed to initiate payment checkout. Please try again." });
  }
});

// Helper function to handle the bid acceptance logic once paid
const processBidAcceptance = async (projectId, bidId, amount, sessionId, paymentIntentId) => {
  // Use atomic findOneAndUpdate to prevent duplicate assignment race conditions
  const project = await Project.findOneAndUpdate(
    { _id: projectId, status: { $in: ["OPEN", "PENDING_FUNDING"] } },
    { status: "ASSIGNED", acceptedBidId: bidId },
    { new: true }
  );

  if (!project) {
    console.warn(`Project ${projectId} is already assigned or closed.`);
    return false;
  }

  // Accept the bid
  const bid = await Bid.findByIdAndUpdate(bidId, { status: "ACCEPTED" }, { new: true }).populate("studentId", "name");
  if (!bid) return false;

  // Reject all other bids
  const rejectedBids = await Bid.find({ projectId, _id: { $ne: bidId } });
  await Bid.updateMany({ projectId, _id: { $ne: bidId } }, { status: "REJECTED" });

  // Update/Convert the pending PaymentLedger record to LOCKED
  await PaymentLedger.findOneAndUpdate(
    { stripeSessionId: sessionId },
    {
      status: "LOCKED",
      stripePaymentIntentId: paymentIntentId || "pi_simulated_" + Math.random().toString(36).substring(2, 10),
      releasedAt: null,
    }
  );

  // Setup milestones in PaymentLedger
  const milestones = await Milestone.find({ projectId });
  for (const milestone of milestones) {
    const numAmount = parseAmount(milestone.amount);
    
    // Create locked ledger allocations per milestone checkpoint
    await PaymentLedger.create({
      projectId,
      milestoneId: milestone._id,
      clientId: project.clientId,
      studentId: bid.studentId._id || bid.studentId,
      amount: numAmount,
      status: "LOCKED",
      stripeSessionId: sessionId,
      stripePaymentIntentId: paymentIntentId || "pi_simulated_alloc",
      transactionRef: genTxnRef(),
    });
  }

  // Log Activity
  const clientUser = await User.findById(project.clientId);
  await Activity.create({
    actorId: project.clientId,
    type: "BID_ACCEPTED",
    message: `${clientUser ? clientUser.name : "Client"} accepted bid & deposited ₹${amount} in Escrow for "${project.title}"`,
    targetId: project._id,
  });

  // Notifications
  await Notification.create({
    recipientId: bid.studentId._id || bid.studentId,
    type: "BID_ACCEPTED",
    message: `Your proposal on "${project.title}" was accepted! Milestone funds are locked in Escrow.`,
    targetId: project._id,
  });

  for (const rBid of rejectedBids) {
    await Notification.create({
      recipientId: rBid.studentId,
      type: "BID_REJECTED",
      message: `Your bid on "${project.title}" was not selected. Keep bidding!`,
      targetId: project._id,
    });
  }

  return true;
};

// @desc    Verify Razorpay payment signature (client-side modal success handler)
// @route   POST /api/payments/verify
// @access  Private
router.post("/verify", protect, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: "Razorpay signature details are required." });
  }

  try {
    const provider = getPaymentProvider();
    
    if (getActiveProviderName() !== "razorpay") {
      return res.status(400).json({ message: "Active payment provider is not Razorpay." });
    }

    const verified = provider.verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!verified) {
      return res.status(400).json({ message: "Razorpay payment signature verification failed." });
    }

    const ledger = await PaymentLedger.findOne({ stripeSessionId: razorpay_order_id, status: "PENDING_CHECKOUT" });
    if (!ledger) {
      // Could be already verified or missing
      const alreadyLocked = await PaymentLedger.findOne({ stripeSessionId: razorpay_order_id, status: "LOCKED" });
      if (alreadyLocked) {
        return res.json({ message: "Payment already verified and locked." });
      }
      return res.status(404).json({ message: "Payment checkout session not found." });
    }

    const bid = await Bid.findOne({ projectId: ledger.projectId, studentId: ledger.studentId, status: "PENDING" });
    if (!bid) {
      return res.status(400).json({ message: "No matching pending bid for this payment." });
    }

    const success = await processBidAcceptance(
      ledger.projectId,
      bid._id,
      ledger.amount,
      razorpay_order_id,
      razorpay_payment_id
    );

    if (success) {
      return res.json({ message: "Razorpay payment verified and processed successfully." });
    } else {
      return res.status(400).json({ message: "Failed to process bid acceptance." });
    }
  } catch (error) {
    console.error("Razorpay signature verification error:", error);
    res.status(500).json({ message: "Verification failed." });
  }
});

// @desc    Cancel checkout session and reopen project for bidding
// @route   POST /api/payments/cancel
// @access  Private
router.post("/cancel", protect, async (req, res) => {
  const { sessionId, projectId } = req.body;

  if (!sessionId && !projectId) {
    return res.status(400).json({ message: "Session/Order ID or Project ID is required." });
  }

  try {
    let ledger = null;
    if (sessionId) {
      ledger = await PaymentLedger.findOne({ stripeSessionId: sessionId, status: "PENDING_CHECKOUT" });
    }
    if (!ledger && projectId) {
      ledger = await PaymentLedger.findOne({ projectId, status: "PENDING_CHECKOUT" });
    }

    if (!ledger) {
      // Revert project status anyway if it's currently stuck in PENDING_FUNDING
      if (projectId) {
        const proj = await Project.findById(projectId);
        if (proj && proj.status === "PENDING_FUNDING") {
          await Project.findByIdAndUpdate(projectId, { status: "OPEN" });
          return res.json({ message: "No checkout session found, but project status reset to OPEN." });
        }
      }
      return res.status(404).json({ message: "Pending payment checkout session not found." });
    }

    // Revert project status back to OPEN
    await Project.findByIdAndUpdate(ledger.projectId, { status: "OPEN" });

    // Mark ledger as FAILED
    ledger.status = "FAILED";
    await ledger.save();

    res.json({ message: "Payment checkout cancelled. Project reopened." });
  } catch (error) {
    console.error("Cancel checkout session error:", error);
    res.status(500).json({ message: "Cancellation failed." });
  }
});

// @desc    Simulate payment completion webhook (for offline fallback testing)
// @route   POST /api/payments/simulate-payment
// @access  Public (Demo helper)
router.post("/simulate-payment", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ message: "Simulation is disabled in production." });
  }
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: "Session ID is required." });
  }

  try {
    const ledger = await PaymentLedger.findOne({ stripeSessionId: sessionId });
    if (!ledger) {
      return res.status(404).json({ message: "Payment session not found." });
    }

    if (ledger.status !== "PENDING_CHECKOUT") {
      return res.json({ message: "Simulated payment already processed." });
    }

    const bid = await Bid.findOne({ projectId: ledger.projectId, studentId: ledger.studentId, status: "PENDING" });
    if (!bid) {
      return res.status(400).json({ message: "No active pending bid matches this payment transaction." });
    }

    const success = await processBidAcceptance(
      ledger.projectId,
      bid._id,
      ledger.amount,
      sessionId,
      "pi_simulated_" + Math.random().toString(36).substring(2, 10)
    );

    if (success) {
      return res.json({ message: "Simulated payment processed successfully. Bid accepted, escrow locked." });
    } else {
      return res.status(400).json({ message: "Failed to accept bid. Project may already be assigned." });
    }
  } catch (error) {
    console.error("Simulation payment error:", error);
    res.status(500).json({ message: "Simulation failed." });
  }
});

// @desc    Real Gateway Webhook endpoint (handles both Stripe & Razorpay signatures)
// @route   POST /api/payments/webhook
// @access  Public
router.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const provider = getPaymentProvider();
  const providerName = getActiveProviderName();

  if (providerName === "mock") {
    return res.status(400).send("Mock provider does not receive webhooks.");
  }

  try {
    const verification = await provider.verifyWebhook(req.body, req.headers);

    if (verification.success) {
      console.log(`Webhook signature verified for ${providerName}. Session: ${verification.sessionId}`);

      // Locate matching pending ledger
      const ledger = await PaymentLedger.findOne({
        stripeSessionId: verification.sessionId,
        status: "PENDING_CHECKOUT"
      });

      if (!ledger) {
        console.warn(`No pending checkout ledger found for session: ${verification.sessionId}`);
        return res.json({ received: true, info: "Payment session already processed or not found." });
      }

      const bid = await Bid.findOne({
        projectId: verification.projectId,
        studentId: verification.studentId,
        status: "PENDING"
      });

      if (!bid) {
        console.warn(`No pending bid found for project: ${verification.projectId} student: ${verification.studentId}`);
        return res.json({ received: true });
      }

      await processBidAcceptance(
        verification.projectId,
        bid._id,
        verification.amount,
        verification.sessionId,
        verification.paymentIntentId
      );

      return res.json({ received: true });
    } else {
      return res.json({ received: true, info: "Skipped event." });
    }
  } catch (err) {
    console.error(`Webhook Processing Error (${providerName}): ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// @desc    Get user payment ledger stats & transactions
// @route   GET /api/payments
// @access  Private
router.get("/", protect, async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch all transactions involving this user (ignore pending checkouts for ledger)
    const transactions = await PaymentLedger.find({
      $or: [{ clientId: userId }, { studentId: userId }],
      status: { $ne: "PENDING_CHECKOUT" },
    })
      .populate("projectId", "title")
      .populate("milestoneId", "title")
      .sort({ updatedAt: -1 });

    // Compute stats
    let lockedAmount = 0;
    let pendingAmount = 0;
    let releasedAmount = 0;

    transactions.forEach((tx) => {
      if (tx.milestoneId) {
        if (tx.status === "LOCKED") {
          lockedAmount += tx.amount;
        } else if (tx.status === "PENDING_REVIEW") {
          pendingAmount += tx.amount;
        } else if (tx.status === "RELEASED") {
          releasedAmount += tx.amount;
        }
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

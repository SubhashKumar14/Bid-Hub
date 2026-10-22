import { httpErrorStatus } from "../lib/validation.js";
import express from "express";
import { createRouter } from "../lib/router.js";
import { getPaymentProvider, getActiveProviderName } from "../payments/index.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { Milestone } from "../models/Milestone.js";
import { Activity } from "../models/Activity.js";
import { Notification } from "../models/Notification.js";
import { User } from "../models/User.js";
import { protect, requireRole } from "../middleware/auth.js";
import { amountToPaise } from "../lib/validation.js";
import { settlePayment } from "../payments/settle.js";
import { PaymentEvent } from "../models/PaymentEvent.js";

const router = createRouter();

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
    if (bid.status !== "PENDING") return res.status(409).json({ message: "Only a pending bid can enter checkout." });

    const project = await Project.findOne({
      _id: bid.projectId,
      clientId: req.user._id,
      status: { $in: ["OPEN", "PENDING_FUNDING"] },
    });

    if (!project) {
      return res.status(400).json({ message: "Project is not open or you are not authorized." });
    }

    const numericAmount = amountToPaise(bid.amount) / 100;
    const milestones = await Milestone.find({ projectId: project._id });
    const milestoneTotal = milestones.reduce((total, milestone) => total + parseAmount(milestone.amount), 0);
    if (milestones.length === 0) {
      return res.status(400).json({ message: "Add at least one milestone before funding this project." });
    }
    if (Math.round(milestoneTotal * 100) !== Math.round(numericAmount * 100)) {
      return res.status(400).json({ message: "The selected bid total must match the project milestone total before checkout." });
    }

    // Atomically claim the project only after confirming its escrow schedule matches the bid.
    const transitionedProject = await Project.findOneAndUpdate(
      { _id: project._id, clientId: req.user._id, status: { $in: ["OPEN", "PENDING_FUNDING"] } },
      { status: "PENDING_FUNDING" },
      { new: true }
    );
    if (!transitionedProject) {
      return res.status(400).json({ message: "Project status changed before checkout could start. Refresh and try again." });
    }
    const clientUrl = process.env.CLIENT_URL || "http://localhost:5173";

    const provider = getPaymentProvider();
    const checkoutData = await provider.createCheckout(transitionedProject, bid, numericAmount, clientUrl, milestones);

    res.json(checkoutData);
  } catch (error) {
    console.error("Escrow checkout initiation error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Failed to initiate payment checkout. Please try again." });
  }
});

// Helper function to handle the bid acceptance logic once paid
const processBidAcceptance = settlePayment;

// @desc    Verify Razorpay payment signature (client-side modal success handler)
// @route   POST /api/payments/verify
// @access  Private (Client owner only)
router.post("/verify", protect, requireRole("client"), async (req, res) => {
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

    const ledger = await PaymentLedger.findOne({
      stripeSessionId: razorpay_order_id,
      milestoneId: null,
      clientId: req.user._id,
      status: "PENDING_CHECKOUT",
    });
    if (!ledger) {
      const alreadyLocked = await PaymentLedger.findOne({
        stripeSessionId: razorpay_order_id,
        milestoneId: null,
        clientId: req.user._id,
        status: "LOCKED",
        stripePaymentIntentId: razorpay_payment_id,
      });
      if (alreadyLocked) {
        return res.json({ message: "Payment already verified and locked." });
      }
      return res.status(404).json({ message: "Payment checkout session not found." });
    }

    const bid = await Bid.findOne({
      projectId: ledger.projectId,
      studentId: ledger.studentId,
      status: "PENDING",
    });
    if (!bid) {
      return res.status(400).json({ message: "No matching pending bid for this payment." });
    }
    if (parseAmount(bid.amount) !== Number(ledger.amount)) {
      return res.status(400).json({ message: "Payment amount does not match the selected bid." });
    }
    if (!(await provider.confirmCapturedPayment(razorpay_order_id, razorpay_payment_id, ledger.amountPaise || amountToPaise(ledger.amount)))) {
      return res.status(409).json({ message: "Payment is not a captured INR payment for the expected amount." });
    }
    await PaymentEvent.updateOne({ paymentId: razorpay_payment_id }, { $setOnInsert: {
      orderId: razorpay_order_id, amountPaise: amountToPaise(ledger.amount), status: "RECEIVED",
    } }, { upsert: true });

    const success = await processBidAcceptance(
      ledger.projectId,
      bid._id,
      ledger.amount,
      razorpay_order_id,
      razorpay_payment_id
    );
    await PaymentEvent.updateOne({ paymentId: razorpay_payment_id }, { status: success ? "PROCESSED" : "NEEDS_RECONCILIATION" });

    if (success) {
      return res.json({ message: "Razorpay payment verified and processed successfully." });
    } else {
      return res.status(400).json({ message: "Failed to process bid acceptance." });
    }
  } catch (error) {
    console.error("Razorpay signature verification error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Verification failed." });
  }
});

// @desc    Cancel checkout session and reopen project for bidding
// @route   POST /api/payments/cancel
// @access  Private (Client owner only)
router.post("/cancel", protect, requireRole("client"), async (req, res) => {
  const { sessionId, projectId } = req.body;

  if (!sessionId && !projectId) {
    return res.status(400).json({ message: "Session/Order ID or Project ID is required." });
  }

  try {
    let ledger = null;
    if (sessionId) {
      ledger = await PaymentLedger.findOne({ stripeSessionId: sessionId, clientId: req.user._id, status: "PENDING_CHECKOUT" });
    }
    if (!ledger && projectId) {
      ledger = await PaymentLedger.findOne({ projectId, clientId: req.user._id, status: "PENDING_CHECKOUT" });
    }

    if (!ledger) {
      // Revert project status anyway if it's currently stuck in PENDING_FUNDING
      if (projectId) {
        const proj = await Project.findOneAndUpdate(
          { _id: projectId, clientId: req.user._id, status: "PENDING_FUNDING" },
          { $set: { status: "OPEN" } },
          { new: true }
        );
        if (proj) {
          return res.json({ message: "No checkout session found, but project status reset to OPEN." });
        }
      }
      return res.status(404).json({ message: "Pending payment checkout session not found." });
    }

    // Revert project status back to OPEN
    const project = await Project.findOneAndUpdate(
      { _id: ledger.projectId, clientId: req.user._id, status: "PENDING_FUNDING" },
      { $set: { status: "OPEN" } },
      { new: true }
    );
    if (!project) {
      return res.status(409).json({ message: "Project is no longer awaiting funding. Refresh before continuing." });
    }

    // Mark ledger as FAILED
    await PaymentLedger.updateOne(
      { _id: ledger._id, clientId: req.user._id, status: "PENDING_CHECKOUT" },
      { $set: { status: "FAILED" } }
    );

    res.json({ message: "Payment checkout cancelled. Project reopened." });
  } catch (error) {
    console.error("Cancel checkout session error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Cancellation failed." });
  }
});

// @desc    Simulate payment completion webhook (for offline fallback testing)
// @route   POST /api/payments/simulate-payment
// @access  Private (Client owner, explicit non-production mock provider only)
router.post("/simulate-payment", protect, requireRole("client"), async (req, res) => {
  if (process.env.NODE_ENV === "production" || getActiveProviderName() !== "mock") {
    return res.status(403).json({ message: "Simulation is disabled in production." });
  }
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: "Session ID is required." });
  }

  try {
    const ledger = await PaymentLedger.findOne({ stripeSessionId: sessionId, clientId: req.user._id, milestoneId: null });
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
    res.status(httpErrorStatus(error)).json({ message: "Simulation failed." });
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
      await PaymentEvent.updateOne({ paymentId: verification.paymentIntentId }, { $setOnInsert: {
        orderId: verification.sessionId, amountPaise: verification.amountPaise, status: "RECEIVED",
      } }, { upsert: true });
      console.log(`Webhook signature verified for ${providerName}. Session: ${verification.sessionId}`);

      // Locate matching pending ledger
      const ledger = await PaymentLedger.findOne({
        stripeSessionId: verification.sessionId,
        milestoneId: null,
      });

      if (!ledger) {
        console.warn(`No pending checkout ledger found for session: ${verification.sessionId}`);
        await PaymentEvent.updateOne({ paymentId: verification.paymentIntentId }, { status: "NEEDS_RECONCILIATION", reason: "Unknown order" });
        return res.json({ received: true, outcome: "NEEDS_RECONCILIATION" });
      }

      if (
        ledger.projectId.toString() !== String(verification.projectId) ||
        ledger.clientId.toString() !== String(verification.clientId) ||
        ledger.studentId.toString() !== String(verification.studentId) ||
        Number(ledger.amount) !== Number(verification.amount)
      ) {
        console.error(`Webhook order metadata did not match the pending ledger for ${verification.sessionId}.`);
        return res.status(400).send("Webhook order metadata mismatch.");
      }

      const bid = await Bid.findOne({
        _id: ledger.bidId,
        projectId: verification.projectId,
        studentId: verification.studentId,
      });

      if (!bid) {
        console.warn(`No pending bid found for project: ${verification.projectId} student: ${verification.studentId}`);
        await PaymentEvent.updateOne({ paymentId: verification.paymentIntentId }, { status: "NEEDS_RECONCILIATION", reason: "Missing bound bid" });
        return res.json({ received: true, outcome: "NEEDS_RECONCILIATION" });
      }
      if (String(verification.bidId) !== bid._id.toString()) {
        console.error(`Webhook bid metadata did not match the pending bid for ${verification.sessionId}.`);
        return res.status(400).send("Webhook bid metadata mismatch.");
      }

      const processed = await processBidAcceptance(
        verification.projectId,
        bid._id,
        verification.amount,
        verification.sessionId,
        verification.paymentIntentId
      );

      await PaymentEvent.updateOne({ paymentId: verification.paymentIntentId }, { status: processed ? "PROCESSED" : "NEEDS_RECONCILIATION", reason: processed ? "" : "Settlement conflict" });
      return res.json({ received: true, outcome: processed ? "PROCESSED" : "NEEDS_RECONCILIATION" });
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
    res.status(httpErrorStatus(error)).json({ message: error.message });
  }
});

export default router;

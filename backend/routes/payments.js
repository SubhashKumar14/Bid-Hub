import { Contract } from "../models/Contract.js";
import { capabilities } from "../config/capabilities.js";
import { agreeOffer } from "../payments/agreement.js";
import { FundingAttempt } from "../models/FundingAttempt.js";
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
import { boundedInteger, amountToPaise } from "../lib/validation.js";
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
  const { bidId, proposalVersion } = req.body;

  if (!bidId) {
    return res.status(400).json({ message: "Bid ID is required." });
  }
  if (!Number.isSafeInteger(proposalVersion) || proposalVersion < 1) return res.status(400).json({ message: "Review and submit the exact proposal version." });

  try {
    const bid = await Bid.findById(bidId).populate("studentId", "name");
    if (!bid) {
      return res.status(404).json({ message: "Bid not found." });
    }
    if (!bid.studentId) return res.status(409).json({ message: "The selected student account is unavailable. Request operator review." });
    if (bid.status === "ACCEPTED" && await Project.exists({ _id: bid.projectId, clientId: req.user._id, acceptedBidId: bid._id })) return res.json({ settled: true });
    if (bid.status !== "PENDING") return res.status(409).json({ message: "Only a pending bid can enter checkout." });

    const project = await Project.findOne({
      _id: bid.projectId,
      clientId: req.user._id,
      status: { $in: ["OPEN", "PENDING_FUNDING"] },
    });

    if (!project) {
      return res.status(400).json({ message: "Project is not open or you are not authorized." });
    }

    if (!await Contract.exists({ projectId: project._id }) && await PaymentLedger.exists({ projectId: project._id, milestoneId: null, status: "PENDING_CHECKOUT" })) return res.status(409).json({ message: "An existing legacy payable order requires operator review. No new order was created." });
    if(project.recoveryPending) return res.status(409).json({message:"Funding is paused for operator review. Resolve the recovery case before reopening checkout."});
    if(project.sampleData) return res.status(409).json({message:"Sample financial scenarios are read-only and were not funded by a gateway. Publish a separate test brief to use Razorpay sandbox checkout."});
    const contract = await agreeOffer(bidId, req.user._id, proposalVersion);
    const existing = await FundingAttempt.findOne({ contractId: contract._id });
    if (existing) {
      if (existing.state === "READY") return res.json(existing.checkout);
      return res.status(409).json({ message: "Funding attempt is pending recovery. Retry later; a second order will not be created." });
    }
    try { await FundingAttempt.create({ contractId: contract._id }); }
    catch (error) { if (error.code === 11000) return res.status(409).json({ message: "Checkout is already being prepared. Retry shortly." }); throw error; }
    let checkoutData;
    try {
      const milestones = await Milestone.find({ projectId: project._id });
      checkoutData = await getPaymentProvider().createCheckout(project, bid, contract.totalPaise / 100, process.env.CLIENT_URL || "http://localhost:5173", milestones);
      await FundingAttempt.updateOne({ contractId: contract._id }, { state: "READY", checkout: checkoutData });
    } catch (error) {
      await FundingAttempt.updateOne({ contractId: contract._id }, { state: "RECOVERY_REQUIRED", reason: "Provider creation outcome uncertain. Operator review required." });
      throw error;
    }
    res.json(checkoutData);
  } catch (error) {
    console.error("Escrow checkout initiation error:", error);
    res.status(httpErrorStatus(error)).json({ message: error.status < 500 ? error.message : "Checkout could not be opened. Your agreement is saved. Refresh its funding status before trying again." });
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
    if (await Contract.exists({ clientId: req.user._id, ...(projectId ? { projectId } : { bidId: (await PaymentLedger.findOne({ stripeSessionId: sessionId, clientId: req.user._id }))?.bidId }) })) return res.json({ message: "Checkout dismissed; agreement and payable order retained for recovery." });
    let ledger = null;
    if (sessionId) {
      ledger = await PaymentLedger.findOne({ stripeSessionId: sessionId, clientId: req.user._id, status: "PENDING_CHECKOUT" });
    }
    if (!ledger && projectId) {
      ledger = await PaymentLedger.findOne({ projectId, clientId: req.user._id, status: "PENDING_CHECKOUT" });
    }

    if (!ledger) return res.status(404).json({ message: "No owned pending order found. An uncertain funding state requires operator review." });
    const project = await Project.findOne({ _id: ledger.projectId, clientId: req.user._id, status: "PENDING_FUNDING" });
    if (!project) return res.status(409).json({ message: "Project is no longer awaiting funding. Refresh before continuing." });
    // Legacy payable orders also survive dismissal: late captures remain reconcilable.
    res.json({ message: "Checkout dismissed; payable order and project state retained for recovery." });
  } catch (error) {
    console.error("Cancel checkout session error:", error);
    res.status(httpErrorStatus(error)).json({ message: "Cancellation failed." });
  }
});

// @desc    Simulate payment completion webhook (for offline fallback testing)
// @route   POST /api/payments/simulate-payment
// @access  Private (Client owner, explicit non-production mock provider only)
router.post("/simulate-payment", protect, requireRole("client"), async (req, res) => {
  if (!capabilities().isolatedTest || getActiveProviderName() !== "mock") {
    return res.status(403).json({ message: "Mock confirmation exists only in isolated automated tests. Use Razorpay test checkout." });
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

    if (ledger.status === "LOCKED") {
      return res.json({ message: "Simulated payment already processed." });
    }
    if (ledger.status !== "PENDING_CHECKOUT") return res.status(409).json({ message: "This order requires operator reconciliation; no funding was simulated." });

    const bid = await Bid.findOne({ projectId: ledger.projectId, studentId: ledger.studentId, status: "PENDING" });
    if (!bid) {
      return res.status(400).json({ message: "No active pending bid matches this payment transaction." });
    }

    const success = await processBidAcceptance(
      ledger.projectId,
      bid._id,
      ledger.amount,
      sessionId,
      "demo_payment_" + sessionId
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

    const page = boundedInteger(req.query.page, 1, 10000), limit = boundedInteger(req.query.limit, 25, 100);
    if (page === null || limit === null) return res.status(400).json({ message: "Invalid ledger pagination." });
    const filter = { $or: [{ clientId: userId }, { studentId: userId }], status: { $ne: "PENDING_CHECKOUT" } };
    const transactions = await PaymentLedger.find(filter).populate("projectId", "title").populate("milestoneId", "title").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean();
    for (const row of transactions) { row.receiptRef ||= `TEST-RECEIPT-${row._id}`; row.testOnly = true; }
    const totals = await PaymentLedger.aggregate([{ $match: { ...filter, milestoneId: { $ne: null } } }, { $group: { _id: "$status", total: { $sum: { $ifNull: ["$amountPaise", { $round: [{ $multiply: ["$amount", 100] }, 0] }] } } } }]);
    const sum = status => (totals.find(row => row._id === status)?.total || 0) / 100;
    const lockedAmount = sum("LOCKED"), pendingAmount = sum("PENDING_REVIEW"), releasedAmount = sum("RELEASED");
    const total = await PaymentLedger.countDocuments(filter);
    res.json({
      stats: {
        lockedAmount,
        pendingAmount,
        releasedAmount,
      },
      transactions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(httpErrorStatus(error)).json({ message: error.message });
  }
});

export default router;

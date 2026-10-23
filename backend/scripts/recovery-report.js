import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { RecoveryCase } from "../models/RecoveryCase.js";
import { FundingAttempt } from "../models/FundingAttempt.js";
import { PaymentEvent } from "../models/PaymentEvent.js";
try {
  await connectDB();
  console.log(JSON.stringify({
    work: await RecoveryCase.find({ state: "OPERATOR_REVIEW" }).lean(),
    funding: await FundingAttempt.find({ state: { $in: ["CREATING", "RECOVERY_REQUIRED"] } }).lean(),
    payments: await PaymentEvent.find({ status: { $ne: "PROCESSED" } }).lean(),
  }, null, 2));
} finally { await mongoose.disconnect(); }

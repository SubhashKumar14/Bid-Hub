import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { User } from "../models/User.js";
import { Review } from "../models/Review.js";
import { Contract } from "../models/Contract.js";
import { FundingAttempt } from "../models/FundingAttempt.js";
import { PaymentLedger } from "../models/PaymentLedger.js";
import { verifiedReviews } from "../services/reputation.js";
import { Milestone } from "../models/Milestone.js";
import { Notification } from "../models/Notification.js";
const apply = process.argv.includes("--apply");
try {
  await connectDB();
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName) throw new Error("A replica set is required before enabling the workflow.");
  const legacy = await Project.countDocuments({ $or: [{ remote: { $exists: false } }, { duration: { $exists: false } }] });
  const unversioned = await Bid.countDocuments({ version: { $exists: false } });
  const unverifiedReleases = await PaymentLedger.countDocuments({status:"RELEASED"});
  const reviewFinancialStates = await PaymentLedger.countDocuments({status:"PENDING_REVIEW"});
  const legacyMilestoneApprovals=await Milestone.countDocuments({status:"RELEASED"});
  console.log(JSON.stringify({ apply, legacyMetadata: legacy, unversionedProposals: unversioned, unverifiedReleases, reviewFinancialStates, legacyMilestoneApprovals, note: "No work approval is a payout. Historical release labels become unverified financial rows and approved work; balances are not invented. Review legacy payment evidence manually." }));
  if (apply) {
    for (const [field, value] of Object.entries({ remote: null, location: "", duration: "", level: "" })) await Project.updateMany({ [field]: { $exists: false } }, { $set: { [field]: value } });
    await Bid.updateMany({ version: { $exists: false } }, { version: 1 });
    for await (const user of User.find().select("_id").cursor()) {
      const ratings = await verifiedReviews({ revieweeId: user._id });
      const accepted = await Bid.find({ studentId: user._id, status: "ACCEPTED" }).distinct("_id");
      const completedProjects = await Project.countDocuments({ status: "COMPLETED", sampleData: {$ne:true}, $or: [{ clientId: user._id }, { acceptedBidId: { $in: accepted } }] });
      await User.updateOne({ _id: user._id }, { rating: ratings.length ? Number((ratings.reduce((n,r)=>n+r.rating,0)/ratings.length).toFixed(2)) : 0, completedProjects });
    }
    for await (const row of PaymentLedger.find({receiptRef:{$exists:false}}).select("_id").cursor()) {
      // Explicit additive migration for this immutable identity; provider references remain untouched.
      await PaymentLedger.collection.updateOne({_id:row._id,receiptRef:{$exists:false}},{$set:{receiptRef:`TEST-RECEIPT-${row._id}`}});
    }
    await PaymentLedger.updateMany({status:"RELEASED"},{$set:{status:"UNVERIFIED",releasedAt:null,settlementNote:"Historical release label cannot be verified as a provider transfer. Work approval is not a payout."}});
    await PaymentLedger.updateMany({status:"PENDING_REVIEW"},{$set:{status:"LOCKED",settlementNote:"Funding stays locked while work review is recorded separately."}});
    await Milestone.updateMany({status:"RELEASED"},{$set:{status:"APPROVED"}});
    await Notification.updateMany({type:"MILESTONE_RELEASED"},{$set:{type:"MILESTONE_APPROVED"}});
    // Additive only: never syncIndexes (which may drop historical indexes).
    await Promise.all([Project, Bid, Contract, FundingAttempt, PaymentLedger].map(model => model.createIndexes()));
    console.log("Additive migration complete. No projects, bids, contracts, evidence or financial rows deleted.");
  }
} finally { await mongoose.disconnect(); }

import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { Project } from "../models/Project.js";
import { Bid } from "../models/Bid.js";
import { User } from "../models/User.js";
import { Review } from "../models/Review.js";
import { Contract } from "../models/Contract.js";
import { FundingAttempt } from "../models/FundingAttempt.js";
const apply = process.argv.includes("--apply");
try {
  await connectDB();
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName) throw new Error("A replica set is required before enabling the workflow.");
  const legacy = await Project.countDocuments({ $or: [{ remote: { $exists: false } }, { duration: { $exists: false } }] });
  const unversioned = await Bid.countDocuments({ version: { $exists: false } });
  console.log(JSON.stringify({ apply, legacyMetadata: legacy, unversionedProposals: unversioned, note: "Legacy agreement wording is not reconstructed. Keep historical payment evidence and review uncertain records manually." }));
  if (apply) {
    for (const [field, value] of Object.entries({ remote: null, location: "", duration: "", level: "" })) await Project.updateMany({ [field]: { $exists: false } }, { $set: { [field]: value } });
    await Bid.updateMany({ version: { $exists: false } }, { version: 1 });
    for await (const user of User.find().select("_id").cursor()) {
      const ratings = await Review.aggregate([{ $match: { revieweeId: user._id } }, { $group: { _id: null, rating: { $avg: "$rating" } } }]);
      const accepted = await Bid.find({ studentId: user._id, status: "ACCEPTED" }).distinct("_id");
      const completedProjects = await Project.countDocuments({ status: "COMPLETED", $or: [{ clientId: user._id }, { acceptedBidId: { $in: accepted } }] });
      await User.updateOne({ _id: user._id }, { rating: ratings.length ? Number(ratings[0].rating.toFixed(2)) : 0, completedProjects });
    }
    // Additive only: never syncIndexes (which may drop historical indexes).
    await Promise.all([Project, Bid, Contract, FundingAttempt].map(model => model.createIndexes()));
    console.log("Additive migration complete. No projects, bids, contracts, evidence or financial rows deleted.");
  }
} finally { await mongoose.disconnect(); }

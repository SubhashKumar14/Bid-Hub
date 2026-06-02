import mongoose from "mongoose";

const reviewSchema = new mongoose.Schema(
  {
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true },
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    revieweeId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true },
  },
  { timestamps: true }
);

// Index for fetching all reviews of a user (profile page)
reviewSchema.index({ revieweeId: 1, createdAt: -1 });
// Index for fetching reviews on a project
reviewSchema.index({ projectId: 1 });
// Unique: one review per reviewer per project (prevents duplicates at DB level)
reviewSchema.index({ projectId: 1, reviewerId: 1 }, { unique: true });

export const Review = mongoose.model("Review", reviewSchema);

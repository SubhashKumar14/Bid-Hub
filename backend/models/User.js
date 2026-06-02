import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, required: true, enum: ["student", "client"] },
    college: { type: String, default: "" },
    skills: { type: [String], default: [] },
    bio: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    rating: { type: Number, default: 5.0 },
    completedProjects: { type: Number, default: 0 },
    profileViews: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Index for fast login lookup and uniqueness
userSchema.index({ email: 1 }, { unique: true });
// Index for role-based filtering (e.g. leaderboard of students)
userSchema.index({ role: 1, rating: -1 });

export const User = mongoose.model("User", userSchema);

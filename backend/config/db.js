import mongoose from "mongoose";
export const connectDB = async () => {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required.");
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  // Funding and review idempotency depend on unique indexes being ready before traffic.
  await Promise.all(Object.values(mongoose.models).map(model => model.init()));
  console.log("MongoDB connected.");
};

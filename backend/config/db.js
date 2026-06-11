import mongoose from "mongoose";

export const connectDB = async () => {
  let uri = process.env.MONGODB_URI;
  if (process.env.NODE_ENV === "test") {
    uri = "mongodb://127.0.0.1:27017/bidhub_test";
  }

  try {
    const conn = await mongoose.connect(uri || "mongodb://127.0.0.1:27017/bidhub");
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Primary database connection failed: ${error.message}`);
    if (uri && uri !== "mongodb://127.0.0.1:27017/bidhub" && uri !== "mongodb://127.0.0.1:27017/bidhub_test") {
      console.log("Attempting fallback to local MongoDB...");
      try {
        const conn = await mongoose.connect("mongodb://127.0.0.1:27017/bidhub");
        console.log(`MongoDB Connected (local fallback): ${conn.connection.host}`);
        return;
      } catch (fallbackError) {
        console.error(`Fallback failed: ${fallbackError.message}`);
      }
    }
    process.exit(1);
  }
};

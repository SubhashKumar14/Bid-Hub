import mongoose from "mongoose";
const schema = new mongoose.Schema({ ownerId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true }, filename: { type: String, required: true, unique: true }, name: String, size: Number }, { timestamps: true });
export const Upload = mongoose.model("Upload", schema);

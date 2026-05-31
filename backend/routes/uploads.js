import express from "express";
import { upload } from "../config/cloudinary.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

const getFileUrl = (file) => {
  if (file.path && file.path.startsWith("http")) {
    return file.path; // Cloudinary URL
  }
  return `/uploads/${file.filename}`; // Local filesystem fallback URL
};

// @desc    Upload single image
// @route   POST /api/uploads/image
// @access  Private
router.post("/image", protect, upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No image file provided" });
  }
  res.json({ url: getFileUrl(req.file) });
});

// @desc    Upload multiple files
// @route   POST /api/uploads/files
// @access  Private
router.post("/files", protect, upload.array("files", 10), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "No files provided" });
  }

  const uploadedFiles = req.files.map((file) => ({
    name: file.originalname,
    url: getFileUrl(file),
  }));

  res.json(uploadedFiles);
});

export default router;

import express from "express";
import AdmZip from "adm-zip";
import axios from "axios";
import rateLimit from "express-rate-limit";
import { upload } from "../config/cloudinary.js";
import { protect } from "../middleware/auth.js";

const router = express.Router();

// Rate limit: 5 import calls per 15 minutes per IP (each GitHub import hits external API)
const importLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Too many import requests. Please wait 15 minutes before trying again." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper to check if file path should be ignored
const isIgnored = (filePath) => {
  const parts = filePath.toLowerCase().split(/[/\\]/);
  return (
    parts.includes("node_modules") ||
    parts.includes(".git") ||
    parts.includes("dist") ||
    parts.includes("build") ||
    parts.includes("coverage") ||
    parts.includes(".gemini") ||
    parts.includes("tmp")
  );
};

// Recommended Limits
const MAX_FILES = 20;
const MAX_SIZE_MB = 50;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
const MAX_IMAGES = 8;

const isImageFile = (filename) => {
  const ext = filename.split(".").pop().toLowerCase();
  return ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext);
};

// @desc    Import local zip file
// @route   POST /api/import/local
// @access  Private
router.post("/local", importLimiter, protect, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Please upload a ZIP file" });
  }

  try {
    const zipPath = req.file.path; // Multer saves file
    const zip = new AdmZip(zipPath);
    const zipEntries = zip.getEntries();

    let validFiles = [];
    let totalSize = 0;
    let imageCount = 0;

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;
      
      const entryName = entry.entryName;
      if (isIgnored(entryName)) continue;

      const size = entry.header.size;
      totalSize += size;

      if (isImageFile(entryName)) {
        imageCount++;
      }

      validFiles.push({
        path: entryName,
        size: size,
        type: entryName.split(".").pop() || "unknown",
      });
    }

    // Verify limits
    if (validFiles.length > MAX_FILES) {
      return res.status(400).json({
        message: `Import rejected: Too many files. Project limit is ${MAX_FILES} files. Zip contains ${validFiles.length} files.`,
      });
    }

    if (totalSize > MAX_SIZE_BYTES) {
      return res.status(400).json({
        message: `Import rejected: Total size exceeds ${MAX_SIZE_MB}MB limit. Zip size is ${(totalSize / (1024 * 1024)).toFixed(2)}MB.`,
      });
    }

    if (imageCount > MAX_IMAGES) {
      return res.status(400).json({
        message: `Import rejected: Too many images. Project limit is ${MAX_IMAGES} images. Zip contains ${imageCount} images.`,
      });
    }

    res.json({
      source: "zip",
      fileCount: validFiles.length,
      totalSize: totalSize,
      manifest: validFiles,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// @desc    Import GitHub repository manifest
// @route   POST /api/import/github
// @access  Private
router.post("/github", importLimiter, protect, async (req, res) => {
  const { repoUrl } = req.body;

  if (!repoUrl) {
    return res.status(400).json({ message: "GitHub repository URL is required" });
  }

  try {
    // Extract owner and repo from URL: e.g. https://github.com/owner/repo
    const regex = /github\.com\/([^/]+)\/([^/]+)/;
    const match = repoUrl.match(regex);
    if (!match) {
      return res.status(400).json({ message: "Invalid GitHub repository URL format" });
    }

    const owner = match[1];
    // Clean repo name from trailing `.git` or `/`
    const repo = match[2].replace(/\.git$/, "").replace(/\/$/, "");

    // Fetch the file tree from GitHub API recursively
    // Try main branch, if fails try master
    let response;
    try {
      response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/main?recursive=1`,
        { headers: { "User-Agent": "BidHub-Client" } }
      );
    } catch (e) {
      response = await axios.get(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/master?recursive=1`,
        { headers: { "User-Agent": "BidHub-Client" } }
      );
    }

    const tree = response.data.tree;
    let validFiles = [];
    let totalSize = 0;
    let imageCount = 0;

    for (const item of tree) {
      if (item.type !== "blob") continue; // only check files, skip folders
      
      const filePath = item.path;
      if (isIgnored(filePath)) continue;

      const size = item.size || 0;
      totalSize += size;

      if (isImageFile(filePath)) {
        imageCount++;
      }

      validFiles.push({
        path: filePath,
        size: size,
        type: filePath.split(".").pop() || "unknown",
      });
    }

    // Verify limits
    if (validFiles.length > MAX_FILES) {
      return res.status(400).json({
        message: `Import rejected: Too many files. Project limit is ${MAX_FILES} files. Repo contains ${validFiles.length} files.`,
      });
    }

    if (totalSize > MAX_SIZE_BYTES) {
      return res.status(400).json({
        message: `Import rejected: Total size exceeds ${MAX_SIZE_MB}MB limit. Repo size is ${(totalSize / (1024 * 1024)).toFixed(2)}MB.`,
      });
    }

    if (imageCount > MAX_IMAGES) {
      return res.status(400).json({
        message: `Import rejected: Too many images. Project limit is ${MAX_IMAGES} images. Repo contains ${imageCount} images.`,
      });
    }

    res.json({
      source: "github",
      fileCount: validFiles.length,
      totalSize: totalSize,
      manifest: validFiles,
    });
  } catch (error) {
    res.status(500).json({
      message: `Failed to fetch GitHub repo: ${error.response?.data?.message || error.message}`,
    });
  }
});

export default router;

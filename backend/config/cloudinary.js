import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import path from "path";
import fs from "fs";

const isCloudinaryConfigured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

let storage;

if (isCloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: process.env.CLOUDINARY_FOLDER || "bidhub",
      allowed_formats: ["jpg", "png", "jpeg", "gif", "webp", "pdf", "zip"],
      resource_type: "auto",
    },
  });
  console.log("Cloudinary Upload Storage configured.");
} else {
  // Local disk fallback — use backend/uploads (resolved from CWD which is backend/)
  const uploadDir = path.resolve("uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
    },
  });
  console.log("Local Filesystem Fallback Upload Storage configured (./uploads).");
}

export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const blockedExts = [
      ".exe", ".bat", ".cmd", ".ps1", ".apk", ".msi", ".jar", ".scr", ".com", ".dll", ".iso", ".sh", ".bash", ".vbs"
    ];
    if (blockedExts.includes(ext)) {
      return cb(new Error(`Security Alert: File type ${ext} is dangerous and not allowed.`));
    }

    const isImportRoute = req.originalUrl && req.originalUrl.includes("/import/");

    // Allowed extensions for general uploads
    const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".docx", ".pptx"];
    if (isImportRoute) {
      allowedExts.push(".zip");
    }

    // Allowed MIME types
    const allowedMimes = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/octet-stream"
    ];
    if (isImportRoute) {
      allowedMimes.push("application/zip", "application/x-zip-compressed");
    }

    const isExtAllowed = allowedExts.includes(ext);
    const isMimeAllowed = allowedMimes.includes(file.mimetype) || file.mimetype.startsWith("image/");

    if (isExtAllowed && isMimeAllowed) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext} (${file.mimetype}). Allowed formats: images, PDF, DOCX, PPTX.`));
    }
  },
});

export { cloudinary };

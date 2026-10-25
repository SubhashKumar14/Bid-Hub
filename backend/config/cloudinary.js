import { mongoPrivateStorage } from "../storage/private.js";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { validFileContent } from "../lib/file-content.js";
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";

// Resolve storage capabilities after loading the same backend configuration as startup.
dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env") });

if (process.env.RENDER) {
  if (!process.env.PRIVATE_STORAGE) process.env.PRIVATE_STORAGE = "mongodb";
}

const isCloudinaryConfigured =
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET;

let storage;
export const avatarStorageAvailable = Boolean(isCloudinaryConfigured) || process.env.NODE_ENV !== "production";

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
  if (process.env.NODE_ENV === "production") {
    const unavailable = () => Object.assign(new Error("Avatar storage unavailable. Configure Cloudinary to enable photo uploads."), { status: 503 });
    storage = { _handleFile(req, file, cb) { cb(unavailable()); }, _removeFile(req, file, cb) { cb(null); } };
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
}

const configuredPrivateDir = process.env.PRIVATE_UPLOAD_DIR?.trim();
export let privateUploadDirectory = configuredPrivateDir || (process.env.NODE_ENV === "production" ? null : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../private-uploads"));
if (privateUploadDirectory) {
  try {
    if (!path.isAbsolute(privateUploadDirectory)) throw new Error("Private storage path must be absolute.");
    fs.mkdirSync(privateUploadDirectory, { recursive: true });
    fs.accessSync(privateUploadDirectory, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    privateUploadDirectory = null;
  }
}
if (!privateUploadDirectory && process.env.PRIVATE_STORAGE !== "mongodb") console.warn("Private attachment storage unavailable. Attachment endpoints will return 503; configure PRIVATE_UPLOAD_DIR on a durable volume to enable them.");
export const privateStorageAvailable = process.env.PRIVATE_STORAGE === "mongodb" || Boolean(privateUploadDirectory);
const privateStorage = process.env.PRIVATE_STORAGE === "mongodb" ? mongoPrivateStorage : privateUploadDirectory ? multer.diskStorage({ destination: privateUploadDirectory, filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()) }) : null;
const privateStorageError = () => Object.assign(new Error("Private attachment storage is unavailable. Please try again after storage is configured."), { status: 503 });
export const requirePrivateUploadStorage = (req, res, next) => privateStorageAvailable ? next() : next(privateStorageError());
const checkedStorage = {
  async _handleFile(req, file, cb) {
    try {
      if (file.fieldname !== "avatar" && !privateStorage) throw privateStorageError();
      const chunks = []; let length = 0;
      for await (const chunk of file.stream) { length += chunk.length; if (length > 10 * 1024 * 1024) throw new Error("File too large"); chunks.push(chunk); }
      const buffer = Buffer.concat(chunks);
      if (!validFileContent(buffer, path.extname(file.originalname).toLowerCase())) throw Object.assign(new Error("File content does not match its extension."), { status: 415 });
      const target = file.fieldname === "avatar" ? storage : privateStorage;
      target._handleFile(req, { ...file, stream: Readable.from(buffer) }, cb);
    } catch (error) { cb(error); }
  },
  _removeFile(req, file, cb) { (file.fieldname === "avatar" ? storage : privateStorage)._removeFile(req, file, cb); }
};
export const importUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => cb(null, path.extname(file.originalname).toLowerCase() === ".zip") });
export const upload = multer({
  storage: checkedStorage,
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

    const isImportRoute = false;

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

    if (isExtAllowed && isMimeAllowed && (file.fieldname !== "avatar" || [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(ext))) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error(`Unsupported file type: ${ext} (${file.mimetype}).`), { status: 415 }));
    }
  },
});

export { cloudinary };

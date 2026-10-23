import { Upload } from "../models/Upload.js";

export async function validateAttachments(files, ownerId) {
  if (!Array.isArray(files) || files.length > 10) throw Object.assign(new Error("At most ten attachments are allowed."), { status: 400 });
  for (const file of files) {
    if (!file || typeof file.name !== "string" || file.name.length > 255 || typeof file.url !== "string" || !/^\/api\/uploads\/files\/[\w.-]+$/.test(file.url)) throw Object.assign(new Error("Invalid attachment reference."), { status: 400 });
    const filename = file.url.split("/").pop();
    if (!await Upload.exists({ filename, ownerId })) throw Object.assign(new Error("Attachments must belong to the uploading account."), { status: 403 });
  }
}

import mongoose from "mongoose";
import crypto from "node:crypto";
import path from "node:path";
export const mongoPrivateStorage = {
  _handleFile(req, file, callback) {
    const filename = crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    const stream = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "privateAttachments" }).openUploadStream(filename);
    stream.on("error", callback);
    stream.on("finish", () => callback(null, { filename, size: stream.length }));
    file.stream.pipe(stream);
  },
  async _removeFile(req, file, callback) {
    try {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "privateAttachments" });
      const record = await bucket.find({ filename: file.filename }).next();
      if (record) await bucket.delete(record._id);
      callback(null);
    } catch (error) { callback(error); }
  },
};
export async function downloadMongoFile(file, res, next) {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "privateAttachments" });
  const record = await bucket.find({ filename: file.filename }).next();
  if (!record) return res.status(404).end();
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  bucket.openDownloadStream(record._id).on("error", next).pipe(res);
}

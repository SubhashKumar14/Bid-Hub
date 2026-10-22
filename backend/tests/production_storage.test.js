import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

const script = `
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import jwt from "jsonwebtoken";
const configured = process.env.STORAGE_CASE === "configured";
let directory;
if (configured) {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "bidhub-storage-test-"));
  process.env.PRIVATE_UPLOAD_DIR = directory;
}
const { privateUploadDirectory } = await import("./config/cloudinary.js");
const { default: uploads } = await import("./routes/uploads.js");
const { User } = await import("./models/User.js");
const { Upload } = await import("./models/Upload.js");
User.findById = () => ({ select: async () => ({ _id: "owner", role: "client" }) });
let stored;
Upload.insertMany = async rows => { stored = rows[0]; };
Upload.findOne = async () => { assert.ok(configured); return stored; };
const app = express();
app.get("/health", (req, res) => res.json({ alive: true }));
app.use("/files", uploads);
app.use((error, req, res, next) => res.status(error.status || 500).json({ message: error.message }));
const server = app.listen(0, "127.0.0.1");
await new Promise(resolve => server.once("listening", resolve));
const base = "http://127.0.0.1:" + server.address().port;
const headers = { Authorization: "Bearer " + jwt.sign({ id: "owner" }, process.env.JWT_SECRET) };
try {
  assert.equal((await fetch(base + "/health")).status, 200);
  assert.equal((await fetch(base + "/files/files/missing")).status, 401);
  const body = new FormData();
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6nnQAAAAASUVORK5CYII=", "base64");
  body.append("files", new Blob([bytes], { type: "image/png" }), "fixture.png");
  const result = await fetch(base + "/files/files", { method: "POST", headers, body });
  assert.equal(result.status, configured ? 200 : 503);
  if (configured) {
    assert.equal(privateUploadDirectory, directory);
    const download = await fetch(base + "/files/files/" + stored.filename, { headers });
    assert.equal(download.status, 200);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  } else {
    assert.equal(privateUploadDirectory, null);
    assert.equal(stored, undefined);
    assert.equal((await fetch(base + "/files/files/missing", { headers })).status, 503);
  }
  assert.equal((await fetch(base + "/health")).status, 200);
  console.log("STORAGE_REGRESSION_PASSED");
} finally {
  await new Promise(resolve => server.close(resolve));
  if (stored) fs.unlinkSync(path.join(directory, stored.filename));
  if (directory) fs.rmdirSync(directory);
}
`;

for (const storageCase of ["missing", "relative", "configured"]) {
  test(`production API survives ${storageCase} private storage with safe attachment behavior`, () => {
    const env = {
      ...process.env, NODE_ENV: "production", STORAGE_CASE: storageCase,
      PRIVATE_UPLOAD_DIR: storageCase === "relative" ? "relative-path" : "",
      JWT_SECRET: "storage-regression-fixture-secret-only",
      CLOUDINARY_CLOUD_NAME: "fixture", CLOUDINARY_API_KEY: "fixture", CLOUDINARY_API_SECRET: "fixture",
    };
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: new URL("../", import.meta.url), env, encoding: "utf8", timeout: 15000,
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr || child.stdout);
    assert.match(child.stdout, /STORAGE_REGRESSION_PASSED/);
  });
}

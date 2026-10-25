import crypto from "node:crypto";
const fields = ["title","description","category","budget","deadline","skillsRequired","milestones","files","fileManifest","importSource","importRevision","remote","location","level","duration"];
export function publishFingerprint(body) {
  const normalized = {};
  for (const key of fields) normalized[key] = body[key] ?? (["skillsRequired","milestones","files","fileManifest"].includes(key) ? [] : key === "remote" ? null : "");
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

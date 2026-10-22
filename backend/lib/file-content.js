import AdmZip from "adm-zip";

export function validFileContent(buffer, extension) {
  if (!Buffer.isBuffer(buffer)) return false;
  if (extension === ".png") return buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if ([".jpg", ".jpeg"].includes(extension)) return buffer.subarray(0, 3).equals(Buffer.from([255,216,255]));
  if (extension === ".gif") return /^GIF8[79]a$/.test(buffer.subarray(0,6).toString());
  if (extension === ".webp") return buffer.subarray(0,4).toString() === "RIFF" && buffer.subarray(8,12).toString() === "WEBP";
  if (extension === ".pdf") return buffer.subarray(0,5).toString() === "%PDF-";
  if ([".docx", ".pptx", ".zip"].includes(extension)) {
    try {
      if (buffer.subarray(0,2).toString() !== "PK") return false;
      const entries = new AdmZip(buffer).getEntries();
      if (entries.length > 2000 || entries.reduce((n,e) => n + e.header.size, 0) > 50 * 1024 * 1024) return false;
      if (entries.some(e => e.entryName.split(/[\\/]/).includes("..") || /^[\\/]|^[A-Za-z]:/.test(e.entryName))) return false;
      return extension === ".zip" || entries.some(e => e.entryName === (extension === ".docx" ? "word/document.xml" : "ppt/presentation.xml"));
    } catch { return false; }
  }
  return false;
}

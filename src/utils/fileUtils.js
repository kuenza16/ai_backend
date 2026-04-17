import fs from "fs";
import path from "path";

export function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Failed to delete temp file:", err);
  }
}

export function normalizeFileName(name = "") {
  return String(name).replace(/\\/g, "/").trim().toLowerCase();
}

export function getExtension(fileName = "") {
  return path.extname(fileName).replace(".", "").toLowerCase();
}
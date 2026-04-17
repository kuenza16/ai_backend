import path from "path";
import projectStore from "../store/projectStore.js";
import { normalizeFileName } from "./fileUtils.js";

export function detectMentionedFile(text = "") {
  const matches = text.match(/([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/g);
  return matches ? matches[0] : null;
}

export function findStoredFile(fileRef = "") {
  const normalizedRef = normalizeFileName(fileRef);
  const entries = Object.entries(projectStore.files);

  for (const [storedName, meta] of entries) {
    const storedNormalized = normalizeFileName(storedName);
    const storedBase = normalizeFileName(path.basename(storedName));
    const refBase = normalizeFileName(path.basename(normalizedRef));

    if (
      storedNormalized === normalizedRef ||
      storedBase === normalizedRef ||
      storedNormalized.endsWith(normalizedRef) ||
      storedBase === refBase
    ) {
      return { name: storedName, meta };
    }
  }

  return null;
}

export function buildProjectContext(limit = 8, charsPerFile = 2000) {
  return Object.entries(projectStore.files)
    .slice(0, limit)
    .map(([name, meta]) => ({
      file: name,
      ext: meta.ext,
      content: meta.content.slice(0, charsPerFile),
    }));
}
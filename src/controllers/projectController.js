import fs from "fs";
import projectStore from "../store/projectStore.js";
import { getExtension, safeDelete } from "../utils/fileUtils.js";

export function storeProjectFile(req, res) {
  let tempPath = null;

  try {
    const file = req.file;
    tempPath = file?.path || null;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    const content = fs.readFileSync(file.path, "utf-8");
    const originalName = file.originalname;

    projectStore.files[originalName] = {
      content,
      fullPath: originalName,
      ext: getExtension(originalName),
      updatedAt: new Date().toISOString(),
    };

    safeDelete(file.path);

    res.json({
      success: true,
      message: "File added to project context",
      file: originalName,
      totalFiles: Object.keys(projectStore.files).length,
    });
  } catch (err) {
    safeDelete(tempPath);
    console.error("Store file error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to store file",
    });
  }
}

export function listProjectFiles(req, res) {
  try {
    const files = Object.entries(projectStore.files).map(([name, meta]) => ({
      file: name,
      ext: meta.ext,
      updatedAt: meta.updatedAt,
    }));

    res.json({
      success: true,
      files,
      totalFiles: files.length,
    });
  } catch (err) {
    console.error("List files error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to list files",
    });
  }
}

export function clearProjectFiles(req, res) {
  try {
    projectStore.files = {};
    res.json({
      success: true,
      message: "Project memory cleared",
    });
  } catch (err) {
    console.error("Clear project error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to clear project memory",
    });
  }
}
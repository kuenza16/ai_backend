import express from "express";
import upload from "../config/multer.js";
import {
  clearProjectFiles,
  listProjectFiles,
  storeProjectFile,
} from "../controllers/projectController.js";

const router = express.Router();

router.post("/file", upload.single("file"), storeProjectFile);
router.get("/files", listProjectFiles);
router.post("/clear", clearProjectFiles);

export default router;
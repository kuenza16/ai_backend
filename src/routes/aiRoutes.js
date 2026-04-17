import express from "express";
import upload from "../config/multer.js";
import {
  chatWithAI,
  completeCode,
  fixSingleFile,
  normalAI,
  streamAI,
} from "../controllers/aiController.js";

const router = express.Router();

router.post("/", normalAI);
router.post("/file", upload.single("file"), fixSingleFile);
router.post("/chat", chatWithAI);
router.post("/complete", completeCode);
router.post("/stream", streamAI);

export default router;
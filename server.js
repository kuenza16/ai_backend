import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import path from "path";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ==========================
// 📁 FILE UPLOAD CONFIG
// ==========================
const upload = multer({ dest: "uploads/" });

// ==========================
// 🧠 SIMPLE PROJECT MEMORY (COPILOT STYLE)
// ==========================
const projectStore = {
  files: {}, // filename -> { content, fullPath, ext, updatedAt }
};

// ==========================
// 🧰 HELPERS
// ==========================
function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Failed to delete temp file:", err);
  }
}

function normalizeFileName(name = "") {
  return String(name).replace(/\\/g, "/").trim().toLowerCase();
}

function getExtension(fileName = "") {
  return path.extname(fileName).replace(".", "").toLowerCase();
}

function detectMentionedFile(text = "") {
  const matches = text.match(/([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/g);
  return matches ? matches[0] : null;
}

function findStoredFile(fileRef = "") {
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

function buildProjectContext(limit = 8, charsPerFile = 2000) {
  return Object.entries(projectStore.files)
    .slice(0, limit)
    .map(([name, meta]) => ({
      file: name,
      ext: meta.ext,
      content: meta.content.slice(0, charsPerFile),
    }));
}

// ==========================
// 🔥 GROQ CORE AI CALL
// ==========================
async function callAI(prompt) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `
You are a senior Copilot-level code engine.

RULES:
- Output ONLY code unless explicitly asked for a short plain-text answer
- No markdown
- No code fences
- Minimal changes only
- Preserve structure where possible
- Follow project context strictly
            `.trim(),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.0,
        max_tokens: 1400,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Groq API Error:", data);
      return data?.error?.message || "Groq API error";
    }

    let output = data?.choices?.[0]?.message?.content || "No response";

    output = output
      .replace(/```[a-zA-Z]*\n?/g, "")
      .replace(/```/g, "")
      .trim();

    return output;
  } catch (err) {
    console.error("callAI error:", err);
    return "AI request failed";
  }
}

// ==========================
// 📁 STORE FILE INTO PROJECT MEMORY
// ==========================
app.post("/project/file", upload.single("file"), (req, res) => {
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
});

// ==========================
// 📁 LIST STORED PROJECT FILES
// ==========================
app.get("/project/files", (req, res) => {
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
});

// ==========================
// 🗑️ CLEAR PROJECT MEMORY
// ==========================
app.post("/project/clear", (req, res) => {
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
});

// ==========================
// 📄 SINGLE FILE FIX
// ==========================
app.post("/ai-file", upload.single("file"), async (req, res) => {
  let tempPath = null;

  try {
    const { query } = req.body;
    const file = req.file;
    tempPath = file?.path || null;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    const code = fs.readFileSync(file.path, "utf-8");

    const prompt = `
Fix this code with minimal changes.

FILE:
${file.originalname}

TASK:
${query || "Find and fix all issues"}

CODE:
${code}
    `.trim();

    const response = await callAI(prompt);

    safeDelete(file.path);

    res.json({
      success: true,
      filename: file.originalname,
      response,
    });
  } catch (err) {
    safeDelete(tempPath);
    console.error("File processing error:", err);
    res.status(500).json({
      success: false,
      error: "File processing failed",
    });
  }
});

// ==========================
// 💬 CHAT / FILE MENTION EDITING
// Supports messages like:
// "fix authController.js"
// "update extension.ts to use streaming"
// ==========================
app.post("/ai-chat", async (req, res) => {
  try {
    const { message, currentFile, currentCode } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: "Message is required",
      });
    }

    const mentionedFile = detectMentionedFile(message);
    const matched = mentionedFile ? findStoredFile(mentionedFile) : null;

    const projectContext = buildProjectContext();

    let prompt = "";

    if (matched) {
      prompt = `
You are editing a requested project file.

USER REQUEST:
${message}

TARGET FILE:
${matched.name}

TARGET FILE CODE:
${matched.meta.content}

CURRENT OPEN FILE:
${currentFile || "unknown"}

CURRENT OPEN FILE CODE:
${currentCode || ""}

PROJECT CONTEXT:
${JSON.stringify(projectContext, null, 2)}

TASK:
Apply the user's request to the target file.

RULES:
- Return ONLY the final updated code for TARGET FILE
- Keep unrelated code unchanged
- Minimal safe edits only
      `.trim();
    } else {
      prompt = `
You are a Copilot-style chat assistant inside a code editor.

USER REQUEST:
${message}

CURRENT OPEN FILE:
${currentFile || "unknown"}

CURRENT OPEN FILE CODE:
${currentCode || ""}

PROJECT CONTEXT:
${JSON.stringify(projectContext, null, 2)}

RULES:
- If the request clearly asks for code, return only code
- If it asks for explanation, answer briefly in plain text
- If a file was requested but not found, say: File not found in project context
      `.trim();
    }

    const response = await callAI(prompt);

    res.json({
      success: true,
      targetFile: matched?.name || null,
      mentionedFile: mentionedFile || null,
      response,
    });
  } catch (err) {
    console.error("AI chat error:", err);
    res.status(500).json({
      success: false,
      error: "AI chat failed",
    });
  }
});

// ==========================
// ⚡ COPILOT-STYLE AUTOCOMPLETE
// ==========================
app.post("/ai-complete", async (req, res) => {
  try {
    const {
      fileName,
      language,
      codeBeforeCursor,
      codeAfterCursor,
      cursor,
      action,
    } = req.body;

    const projectContext = buildProjectContext();

    const prompt = `
You are GitHub Copilot inside a code editor.

PROJECT CONTEXT:
${JSON.stringify(projectContext, null, 2)}

CURRENT FILE:
${fileName || "unknown"}

LANGUAGE:
${language || "unknown"}

CODE BEFORE CURSOR:
${codeBeforeCursor || ""}

CODE AFTER CURSOR:
${codeAfterCursor || ""}

CURSOR POSITION:
${JSON.stringify(cursor || {}, null, 2)}

TASK:
${action || "Continue the code from the cursor"}

RULES:
- Output ONLY the next best code suggestion
- Must match project style
- Use surrounding context if needed
- Minimal change preferred
    `.trim();

    const response = await callAI(prompt);

    res.json({
      success: true,
      suggestion: response,
    });
  } catch (err) {
    console.error("Autocomplete error:", err);
    res.status(500).json({
      success: false,
      error: "Autocomplete failed",
    });
  }
});

// ==========================
// ⚡ STREAMING (REALTIME COPILOT)
// ==========================
app.post("/ai-stream", async (req, res) => {
  try {
    const { prompt } = req.body;

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `
You are a real-time Copilot engine.
Return only next code tokens.
No explanation.
            `.trim(),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.0,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      console.error("Streaming API error:", text);
      return res.status(500).end("Stream failed");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value));
    }

    res.end();
  } catch (err) {
    console.error("Stream failed:", err);
    res.status(500).end("Stream failed");
  }
});

// ==========================
// 🧠 NORMAL AI ROUTE
// ==========================
app.post("/ai", async (req, res) => {
  try {
    const { mode, code, query, context, fileName, language } = req.body;

    let prompt = "";

    if (mode === "code") {
      prompt = `
FILE:
${fileName || "unknown"}

LANGUAGE:
${language || "unknown"}

CODE:
${code || ""}

TASK:
${query || "Improve or continue this code with minimal safe changes"}
      `.trim();
    } else if (mode === "debug") {
      prompt = `
FILE:
${fileName || "unknown"}

LANGUAGE:
${language || "unknown"}

DEBUG THIS CODE:
${code || ""}

ERROR / TASK:
${query || "Find and fix issues"}
      `.trim();
    } else if (mode === "context") {
      prompt = `
CONTEXT:
${JSON.stringify(context || {}, null, 2)}

FILE:
${fileName || "unknown"}

LANGUAGE:
${language || "unknown"}

CODE:
${code || ""}

TASK:
${query || ""}
      `.trim();
    } else {
      prompt = query || "";
    }

    const response = await callAI(prompt);

    res.json({
      success: true,
      response,
    });
  } catch (err) {
    console.error("AI route error:", err);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

// ==========================
// 🚀 START SERVER
// ==========================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`⚡ Copilot AI Backend running on http://localhost:${PORT}`);
});
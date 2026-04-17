import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";

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
  files: {}, // filename -> content
};

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
- Output ONLY code
- No explanations
- Minimal changes only
- Preserve structure
- Follow project context strictly
            `.trim(),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.0,
        max_tokens: 1200,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Groq API Error:", data);
      return data?.error?.message || "Groq API error";
    }

    let output = data?.choices?.[0]?.message?.content || "No response";

    // cleanup
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
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const content = fs.readFileSync(file.path, "utf-8");

    projectStore.files[file.originalname] = content;

    fs.unlinkSync(file.path);

    res.json({
      success: true,
      message: "File added to project context",
      file: file.originalname,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to store file" });
  }
});

// ==========================
// 📄 SINGLE FILE FIX (LIKE BEFORE)
// ==========================
app.post("/ai-file", upload.single("file"), async (req, res) => {
  try {
    const { query } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded",
      });
    }

    const code = fs.readFileSync(file.path, "utf-8");

    const prompt = `
Fix this code with minimal changes.

TASK:
${query || "Find and fix all issues"}

CODE:
${code}
    `.trim();

    const response = await callAI(prompt);

    fs.unlinkSync(file.path);

    res.json({
      success: true,
      filename: file.originalname,
      response,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "File processing failed",
    });
  }
});

// ==========================
// ⚡ COPILOT-STYLE AUTOCOMPLETE (MAIN FEATURE)
// ==========================
app.post("/ai-complete", async (req, res) => {
  try {
    const { file, cursor, action } = req.body;

    const projectContext = Object.entries(projectStore.files)
      .map(([name, content]) => ({
        file: name,
        content: content.slice(0, 2000),
      }));

    const prompt = `
You are GitHub Copilot inside a code editor.

PROJECT CONTEXT:
${JSON.stringify(projectContext, null, 2)}

CURRENT FILE:
${file}

CURSOR POSITION:
${cursor}

TASK:
${action}

RULES:
- Output ONLY code suggestion
- Must match project style
- Use other files if needed
- Minimal change preferred
    `.trim();

    const response = await callAI(prompt);

    res.json({
      success: true,
      suggestion: response,
    });
  } catch (err) {
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

    res.setHeader("Content-Type", "text/plain");

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

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      res.write(decoder.decode(value));
    }

    res.end();
  } catch (err) {
    res.status(500).end("Stream failed");
  }
});

// ==========================
// 🧠 NORMAL AI ROUTE
// ==========================
app.post("/ai", async (req, res) => {
  try {
    const { mode, code, query, context } = req.body;

    let prompt = "";

    if (mode === "code") {
      prompt = `Fix/improve code:\n${code}\nTask:${query}`;
    } else if (mode === "debug") {
      prompt = `Debug:\n${code}\nError:${query}`;
    } else if (mode === "context") {
      prompt = `Context:${JSON.stringify(context)}\nCode:${code}\nTask:${query}`;
    } else {
      prompt = query;
    }

    const response = await callAI(prompt);

    res.json({
      success: true,
      response,
    });
  } catch (err) {
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
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
You are a senior debugging engine.

RULES:
- Detect issues in code
- Fix them with minimal changes
- Output ONLY final corrected code
- No explanation
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
// 📄 FILE UPLOAD + DEBUG FIX
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

    // read file content
    const code = fs.readFileSync(file.path, "utf-8");

    const prompt = `
You are a code debugging assistant.

TASK:
${query || "Find and fix all issues in this code"}

CODE:
${code}

RULES:
- Identify bugs, errors, bad practices
- Fix with minimal changes
- Output ONLY final working code
    `.trim();

    const response = await callAI(prompt);

    // cleanup temp file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      filename: file.originalname,
      response,
    });
  } catch (err) {
    console.error("File route error:", err);
    res.status(500).json({
      success: false,
      error: "File processing failed",
    });
  }
});

// ==========================
// ⚡ STREAMING (unchanged)
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
            content: "You are a Copilot-style AI that outputs only code.",
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
    console.error("Stream error:", err);
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
      prompt = `Debug this code:\n${code}\nError:${query}`;
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
  console.log(`⚡ AI Backend running on http://localhost:${PORT}`);
});
import fs from "fs";
import { callAI } from "../services/aiService.js";
import { safeDelete } from "../utils/fileUtils.js";
import {
  buildProjectContext,
  detectMentionedFile,
  findStoredFile,
} from "../utils/projectUtils.js";

export async function fixSingleFile(req, res) {
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
}

export async function chatWithAI(req, res) {
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
}

export async function completeCode(req, res) {
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
}

export async function streamAI(req, res) {
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
}

export async function normalAI(req, res) {
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
}
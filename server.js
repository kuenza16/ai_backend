import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// ======================================================
// 🔥 GROQ CORE AI CALL (NON-STREAM)
// ======================================================
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
You are a deterministic code engine (Copilot style).

STRICT RULES:
- Output ONLY code
- Do NOT explain anything
- Do NOT include markdown
- Do NOT include multiple solutions
- Modify only what is necessary
- Keep original structure unless required
            `.trim(),
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.0,
        max_tokens: 800,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Groq API Error:", data);
      return data?.error?.message || "Groq API error";
    }

    let output = data?.choices?.[0]?.message?.content || "No response";

    // Clean output (remove markdown fences if any)
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

// ======================================================
// ⚡ STREAMING AI (REAL-TIME OUTPUT)
// ======================================================
app.post("/ai-stream", async (req, res) => {
  try {
    const { prompt } = req.body;

    res.setHeader("Content-Type", "text/plain");
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

      const chunk = decoder.decode(value);
      res.write(chunk);
    }

    res.end();
  } catch (err) {
    console.error("Stream error:", err);
    res.status(500).end("Stream failed");
  }
});

// ======================================================
// 🧠 MAIN AI ROUTE (COPILOT + CONTEXT SUPPORT)
// ======================================================
app.post("/ai", async (req, res) => {
  try {
    const { mode, code, query, context } = req.body;

    let prompt = "";

    // ---------------- CODE MODE ----------------
    if (mode === "code") {
      prompt = `
Improve this code with MINIMAL changes.

RULES:
- Only modify necessary parts
- Keep structure same unless required
- Output ONLY final code
- No explanation

CODE:
${code}

TASK:
${query}
      `.trim();
    }

    // ---------------- DEBUG MODE ----------------
    else if (mode === "debug") {
      prompt = `
Fix this code with minimal changes.

RULES:
- Output ONLY fixed code
- No explanation
- No alternatives

CODE:
${code}

ERROR:
${query}
      `.trim();
    }

    // ---------------- CONTEXT MODE ----------------
    else if (mode === "context") {
      prompt = `
You are working inside a full project.

PROJECT CONTEXT:
${JSON.stringify(context || {}, null, 2)}

CURRENT FILE:
${code}

TASK:
${query}

Return ONLY updated code.
      `.trim();
    }

    // ---------------- CHAT MODE ----------------
    else {
      prompt = query;
    }

    const response = await callAI(prompt);

    res.json({
      success: true,
      response,
    });

  } catch (err) {
    console.error("Route error:", err);
    res.status(500).json({
      success: false,
      error: "Server error",
    });
  }
});

// ======================================================
// 🚀 START SERVER
// ======================================================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`⚡ AI Backend running on http://localhost:${PORT}`);
});
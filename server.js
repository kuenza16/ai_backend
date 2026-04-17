import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// --------------------
// GROQ AI CALL
// --------------------
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
You are a deterministic code engine.

STRICT RULES:
- Output ONLY ONE final code solution
- NO explanations
- NO markdown
- NO code fences
- NO comments unless necessary
- If multiple solutions exist, choose the best one only
- Output MUST be raw code only
            `.trim(),
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.0,
        max_tokens: 600,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Groq API Error:", data);
      return data?.error?.message || "Groq API error";
    }

    let output = data?.choices?.[0]?.message?.content || "No response";

    // --------------------
    // CLEAN OUTPUT (FORCED SINGLE CODE)
    // --------------------
    output = output
      .replace(/```[a-zA-Z]*\n?/g, "")
      .replace(/```/g, "")
      .split("\n\n")[0] // forces single solution
      .trim();

    return output;
  } catch (err) {
    console.error("callAI error:", err);
    return "AI request failed";
  }
}

// --------------------
// MAIN ROUTE
// --------------------
app.post("/ai", async (req, res) => {
  try {
    const { mode, code, query } = req.body;

    let prompt = "";

    // --------------------
    // CODE MODE (COPILOT STYLE)
    // --------------------
    if (mode === "code") {
      prompt = `
Improve this code.

RULES:
- Output ONLY one final improved code
- NO explanation
- NO markdown
- NO alternatives

Code:
${code}

Task:
${query}
      `.trim();
    }

    // --------------------
    // DEBUG MODE
    // --------------------
    else if (mode === "debug") {
      prompt = `
Fix this code.

RULES:
- Output ONLY corrected code
- NO explanation
- NO markdown
- NO alternatives

Code:
${code}

Error:
${query}
      `.trim();
    }

    // --------------------
    // CHAT MODE
    // --------------------
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

// --------------------
// START SERVER
// --------------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`⚡ AI Backend running on http://localhost:${PORT}`);
});
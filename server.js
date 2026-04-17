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
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: "You are a senior software engineer AI assistant. Help with coding, debugging, and optimization.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 600,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error("Groq API Error:", data);
      return data?.error?.message || "Groq API error";
    }

    return data?.choices?.[0]?.message?.content || "No response";
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

    if (mode === "code") {
      prompt = `
Improve the following code:
\`\`\`
${code}
\`\`\`

Task: ${query}

Return clean optimized code with explanation.
`;
    } else if (mode === "debug") {
      prompt = `
Fix the following code:
\`\`\`
${code}
\`\`\`

Error / Issue:
${query}

Return fixed code with explanation.
`;
    } else {
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
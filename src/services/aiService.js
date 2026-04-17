export async function callAI(prompt) {
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
            ccontent: `
You are a senior Copilot-level code engine.

RULES:
- Output ONLY code or valid JSON when requested
- No markdown
- No code fences
- Minimal changes only
- Preserve structure where possible
- Follow project context strictly
- If the user asks to create files/folders, return ONLY valid JSON actions
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
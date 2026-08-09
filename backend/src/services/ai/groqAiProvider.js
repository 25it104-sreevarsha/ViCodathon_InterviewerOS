import { env } from "../../config/env.js";

/**
 * Real AI provider, wired to Groq's OpenAI-compatible chat completions API.
 *
 * This exists alongside anthropicAiProvider.js as an interchangeable
 * implementation of the same `complete({ system, prompt, maxTokens })`
 * contract defined in aiProvider.js — questionGenerator and answerEvaluator
 * never know which one is active. It is NOT active by default — the engine
 * runs on `mockAiProvider` until you opt in:
 *
 *   AI_PROVIDER=groq
 *   GROQ_API_KEY=gsk_...
 *   GROQ_MODEL=llama-3.3-70b-versatile   (optional, this is already the default)
 *
 * Groq's API mirrors OpenAI's /chat/completions shape (system + user
 * messages in, `choices[0].message.content` out as a plain string), which
 * is why this provider looks structurally different from
 * anthropicAiProvider.js even though it fulfills the exact same interface.
 */
async function complete({ system, prompt, maxTokens = 600 }) {
  if (!env.ai.groq.apiKey) {
    throw new Error(
      "AI_PROVIDER=groq is set but GROQ_API_KEY is missing. " +
        "Set GROQ_API_KEY in .env, or set AI_PROVIDER=mock to use the deterministic mock provider instead."
    );
  }

  let response;
  try {
    response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.ai.groq.apiKey}`,
      },
      body: JSON.stringify({
        model: env.ai.groq.model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (err) {
    // Network failure, DNS, timeout, etc. — never let a raw fetch exception
    // (or an undefined `response`) propagate past this module.
    throw new Error(`Groq API request failed: ${err.message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Groq API request failed (${response.status}): ${body}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error(`Groq API returned a response that was not valid JSON: ${err.message}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new Error("Groq API response contained no message content.");
  }

  return content;
}

export const groqAiProvider = { complete };

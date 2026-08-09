import { env } from "../../config/env.js";

/**
 * Real AI provider, wired to the Anthropic Messages API.
 *
 * This is the actual model-integration point for question generation and
 * answer evaluation. It is NOT active by default — the engine runs on
 * `mockAiProvider` until you opt in:
 *
 *   AI_PROVIDER=anthropic
 *   AI_API_KEY=sk-ant-...
 *   AI_MODEL=claude-sonnet-4-6   (optional, this is already the default)
 *
 * Nothing else in the codebase needs to change to use this — questionGenerator
 * and answerEvaluator only ever call the generic `aiProvider.complete(...)`
 * from aiProvider.js, which picks this module based on env.ai.provider.
 */
async function complete({ system, prompt, maxTokens = 600 }) {
  if (!env.ai.apiKey) {
    throw new Error(
      "AI_PROVIDER=anthropic is set but AI_API_KEY is missing. " +
        "Set AI_API_KEY in .env, or set AI_PROVIDER=mock to use the deterministic mock provider instead."
    );
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ai.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.ai.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Anthropic API request failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const textBlock = data.content?.find((block) => block.type === "text");
  if (!textBlock) {
    throw new Error("Anthropic API response contained no text content block.");
  }
  return textBlock.text;
}

export const anthropicAiProvider = { complete };

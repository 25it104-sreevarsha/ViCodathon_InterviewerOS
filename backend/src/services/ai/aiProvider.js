import { env } from "../../config/env.js";
import { mockAiProvider } from "./mockAiProvider.js";
import { anthropicAiProvider } from "./anthropicAiProvider.js";
import { groqAiProvider } from "./groqAiProvider.js";

/**
 * AI provider abstraction.
 *
 * This is the ONLY module in the codebase that knows which concrete AI
 * backend is in use. questionGenerator.js and answerEvaluator.js call
 * `aiProvider.complete(...)` and never touch a provider-specific SDK or URL
 * directly — that's what makes swapping models/providers later a one-line
 * env change instead of a rewrite.
 *
 * Every provider must implement:
 *   complete({ system, prompt, context, maxTokens }) => Promise<string>
 *
 * - `system` / `prompt`: the actual text sent to a real LLM.
 * - `context`: the structured input the text was built from. Real providers
 *   ignore it. `mockAiProvider` uses it directly instead of re-parsing its
 *   own prompt string, which keeps deterministic dev/test behavior decoupled
 *   from prompt wording.
 * - Returns the raw text response (expected to contain a JSON object; callers
 *   are responsible for extracting/validating it — see utils/jsonExtract.js
 *   and schemas/evaluation.schema.js).
 */
function resolveProvider() {
  switch (env.ai.provider) {
    case "anthropic":
      return anthropicAiProvider;
    case "groq":
      return groqAiProvider;
    case "mock":
      return mockAiProvider;
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${env.ai.provider}". Expected "mock", "anthropic", or "groq".`
      );
  }
}

export const aiProvider = {
  complete(request) {
    return resolveProvider().complete(request);
  },
  name() {
    return env.ai.provider;
  },
};

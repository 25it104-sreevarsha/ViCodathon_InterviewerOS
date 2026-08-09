/**
 * Pulls the first {...} block out of raw model text.
 *
 * Prompts explicitly instruct the model to respond with ONLY a JSON object,
 * but real LLMs sometimes wrap it in prose or a markdown code fence anyway.
 * Both questionGenerator and answerEvaluator parse AI output, so this lives
 * here once instead of being duplicated in both places.
 */

/**
 * Finds the first balanced `{...}` substring starting at the first `{`,
 * tracking brace depth (and skipping braces inside string literals) instead
 * of greedily matching from the first `{` to the LAST `}` in the whole
 * text. Hardening, not a redesign: for the common case (response is just
 * one JSON object, no trailing prose) this returns exactly the same
 * substring the old `\{[\s\S]*\}` regex did. It only differs when there's
 * text AFTER the JSON object that happens to contain its own `{`/`}`
 * characters (e.g. trailing commentary, a stray emoji-ish aside) — where
 * the old greedy regex would have over-captured into invalid JSON.
 */
function firstBalancedJsonObject(text) {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return null; // unbalanced/truncated — let the caller's JSON.parse surface a clear error
}

export function extractJson(raw) {
  if (typeof raw !== "string") return raw;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const balanced = firstBalancedJsonObject(candidate);
  return balanced ?? candidate;
}

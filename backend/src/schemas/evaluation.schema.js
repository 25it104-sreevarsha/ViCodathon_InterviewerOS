import { ValidationError } from "../utils/errors.js";

const ALLOWED_DIFFICULTIES = ["easy", "medium", "hard"];

function clampScore(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(Math.max(0, Math.min(10, n)) * 10) / 10;
}

function toStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

/**
 * Validates and sanitizes raw evaluator output (from any AI provider) into
 * the canonical evaluation shape the rest of the engine relies on.
 *
 * Why sanitize instead of hard-rejecting on any imperfection: LLM output can
 * be *almost* right (a score sent as "8" instead of 8, a missing optional
 * field) without being untrustworthy. Coercing keeps the adaptive loop
 * resilient. What it does NOT tolerate is the response not being a JSON
 * object at all — that's a real failure and throws, so callers don't
 * silently proceed on garbage.
 */
export function validateEvaluation(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Evaluator output must be a JSON object.");
  }

  const score = clampScore(raw.score, 5);
  const recommendedDifficulty = ALLOWED_DIFFICULTIES.includes(raw.recommendedDifficulty)
    ? raw.recommendedDifficulty
    : "medium";

  return {
    score,
    correctness: clampScore(raw.correctness, score),
    depth: clampScore(raw.depth, score),
    reasoning: clampScore(raw.reasoning, score),
    clarity: clampScore(raw.clarity, score),
    missingConcepts: toStringArray(raw.missingConcepts),
    misconceptions: toStringArray(raw.misconceptions),
    strengths: toStringArray(raw.strengths),
    knowledgeGaps: toStringArray(raw.knowledgeGaps),
    shouldFollowUp: typeof raw.shouldFollowUp === "boolean" ? raw.shouldFollowUp : score < 7,
    recommendedDifficulty,
  };
}

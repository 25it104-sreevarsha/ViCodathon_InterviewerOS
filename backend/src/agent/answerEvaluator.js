import { aiProvider } from "../services/ai/aiProvider.js";
import { buildEvaluationPrompt } from "../prompts/evaluation.prompt.js";
import { extractJson } from "../utils/jsonExtract.js";
import { validateEvaluation } from "../schemas/evaluation.schema.js";
import { ValidationError } from "../utils/errors.js";

/**
 * Evaluates one candidate answer against the curriculum day it was asked
 * about. Always returns the canonical, schema-validated evaluation shape
 * (see schemas/evaluation.schema.js) — callers never parse free-form prose.
 */
async function evaluateAnswer({ question, answerText, day, candidate, previousEvaluations = [] }) {
  if (typeof answerText !== "string" || answerText.trim() === "") {
    throw new ValidationError("answerText must be a non-empty string.");
  }

  const context = {
    kind: "evaluation",
    question,
    answerText,
    day,
    candidateProfile: {
      name: candidate.member.name,
      jobRole: candidate.member.jobRole,
      targetRole: candidate.member.targetRole ?? candidate.member.jobRole,
      yearsExperience: candidate.member.yearsExperience,
    },
    previousEvaluations,
  };

  const { system, prompt } = buildEvaluationPrompt(context);
  const raw = await aiProvider.complete({ system, prompt, context, maxTokens: 700 });

  let parsed;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch (err) {
    throw new ValidationError(`AI evaluator did not return valid JSON: ${err.message}`);
  }

  return validateEvaluation(parsed);
}

export const answerEvaluator = { evaluateAnswer };

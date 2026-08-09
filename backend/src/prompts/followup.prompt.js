import { memoryInstruction } from "./question.prompt.js";

/**
 * Builds the prompt for an adaptive follow-up question — used when the
 * adaptive engine decides the candidate's last answer left a specific gap
 * worth probing before moving to new material. Kept separate from
 * question.prompt.js because the framing is different: this is not a fresh
 * topic, it's a targeted probe of `assessment.focusConcepts`.
 */
export function buildFollowUpPrompt(context) {
  const { assessment, candidateProfile, previousQuestions, memoryContext, avoidHint } = context;

  const system = [
    "You are the adaptive follow-up module of an AI technical interviewer.",
    "The candidate's previous answer left specific gaps. You generate ONE targeted follow-up question",
    "that probes exactly those gaps on the SAME topic — this is not a new topic.",
    "Respond with ONLY a single JSON object — no prose, no markdown fences — matching exactly:",
    '{"question": string, "focusConcepts": string[]}',
  ].join("\n");

  const prompt = [
    `Candidate: ${candidateProfile.name ?? "candidate"}, targeting "${candidateProfile.targetRole ?? candidateProfile.jobRole}" (${candidateProfile.yearsExperience} yrs experience).`,
    `Curriculum day ${assessment.curriculumDay} — "${assessment.topic}".`,
    `Specific gaps/misconceptions from the previous answer to probe: ${
      (assessment.focusConcepts ?? []).join("; ") || "general understanding of the topic"
    }.`,
    `Question type: ${assessment.questionType}. Target difficulty: ${assessment.difficulty}.`,
    previousQuestions?.length > 0 ? `Already asked (do not repeat): ${previousQuestions.join(" | ")}` : "",
    avoidHint
      ? `Your previous attempt duplicated a prior question: "${avoidHint}". Ask something meaningfully different.`
      : "",
    memoryInstruction(memoryContext, assessment.topic),
    "Generate one focused follow-up question targeting the gaps above. Return only the JSON object.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, prompt };
}

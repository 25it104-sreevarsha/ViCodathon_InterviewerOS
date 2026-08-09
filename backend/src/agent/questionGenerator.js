import { aiProvider } from "../services/ai/aiProvider.js";
import { buildQuestionPrompt } from "../prompts/question.prompt.js";
import { buildFollowUpPrompt } from "../prompts/followup.prompt.js";
import { extractJson } from "../utils/jsonExtract.js";
import { ValidationError } from "../utils/errors.js";

const MAX_GENERATION_ATTEMPTS = 2;

function normalize(text) {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function isDuplicate(questionText, previousQuestions) {
  const norm = normalize(questionText);
  return previousQuestions.some((q) => normalize(q) === norm);
}

async function generateOnce({ assessment, candidate, previousQuestions, memoryContext, avoidHint }) {
  const context = {
    kind: assessment.isFollowUp ? "followup" : "question",
    assessment,
    candidateProfile: {
      name: candidate.member.name,
      jobRole: candidate.member.jobRole,
      targetRole: candidate.member.targetRole ?? candidate.member.jobRole,
      yearsExperience: candidate.member.yearsExperience,
      education: candidate.member.education,
      branch: candidate.member.branch ?? null,
      technicalSkills: candidate.member.technicalSkills ?? [],
      projects: candidate.member.projects ?? [],
      mode: candidate.member.mode ?? "demo",
    },
    previousQuestions,
    memoryContext: memoryContext ?? {},
    avoidHint,
  };

  const { system, prompt } = assessment.isFollowUp ? buildFollowUpPrompt(context) : buildQuestionPrompt(context);

  const raw = await aiProvider.complete({ system, prompt, context, maxTokens: 500 });

  let parsed;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch (err) {
    throw new ValidationError(`AI question generator did not return valid JSON: ${err.message}`);
  }

  if (typeof parsed.question !== "string" || parsed.question.trim() === "") {
    throw new ValidationError("AI question generator returned an empty question.");
  }

  return {
    questionNumber: assessment.questionNumber,
    planIndex: assessment.planIndex ?? null,
    isFollowUp: Boolean(assessment.isFollowUp),
    curriculumDay: assessment.curriculumDay,
    topic: assessment.topic,
    skill: assessment.skill,
    moduleTitle: assessment.moduleTitle ?? null,
    objectives: assessment.objectives ?? [],
    questionType: assessment.questionType,
    difficulty: assessment.difficulty,
    focusConcepts:
      Array.isArray(parsed.focusConcepts) && parsed.focusConcepts.length > 0
        ? parsed.focusConcepts
        : assessment.focusConcepts ?? [],
    question: parsed.question.trim(),
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates one interview question (or follow-up) for the given assessment.
 *
 * `assessment` comes from either interviewPlanner (a planned entry) or
 * adaptiveEngine (a follow-up or difficulty-adjusted next step) — both
 * shapes carry curriculumDay/topic/skill/difficulty/questionType, so this
 * function doesn't need to know which produced it.
 *
 * Dedup: if the model (or the deterministic mock, given identical inputs)
 * produces a question matching one already asked this interview, retries
 * with a hint, then falls back to an explicit disambiguating suffix rather
 * than silently serving a duplicate.
 */
async function generateQuestion(input) {
  const previousQuestions = input.previousQuestions ?? [];
  let lastAttemptText = null;

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    const question = await generateOnce({ ...input, previousQuestions, avoidHint: lastAttemptText });
    if (!isDuplicate(question.question, previousQuestions)) {
      return question;
    }
    lastAttemptText = question.question;
  }

  const finalAttempt = await generateOnce({ ...input, previousQuestions, avoidHint: lastAttemptText });
  if (isDuplicate(finalAttempt.question, previousQuestions)) {
    finalAttempt.question = `${finalAttempt.question} (follow-up variant on ${input.assessment.topic})`;
  }
  return finalAttempt;
}

export const questionGenerator = { generateQuestion };

/**
 * Turns raw memory-provider output into ONE natural-language line the model
 * can act on, instead of dumping the raw JSON into the prompt. Prefers an
 * insight that actually mentions the current topic (a concrete earlier gap
 * on THIS material) over an unrelated one, so a resurfacing topic gets a
 * genuinely sharper question rather than generic "recall context" noise.
 *
 * The instruction deliberately tells the model to weave the probe in
 * naturally — the candidate must never see anything like "memory says you
 * have a gap here" (task brief "MEMORY SHOULD MATTER").
 */
export function memoryInstruction(memoryContext, topic) {
  const insights = memoryContext?.insights;
  if (!Array.isArray(insights) || insights.length === 0) return "";

  // Topic-scoped ONLY (see mockAiProvider.js `relevantMemoryInsight` for the
  // same rule, kept deliberately identical): an insight from an unrelated
  // earlier topic must never bleed into a question about something else,
  // or "memory matters" degrades into "memory clutters every question".
  const topicWords = String(topic ?? "").toLowerCase();
  const relevant = insights.find(
    (i) =>
      i.topic &&
      (i.type === "misconception" || i.type === "knowledge_gap") &&
      (topicWords.includes(String(i.topic).toLowerCase()) || String(i.topic).toLowerCase().includes(topicWords))
  );

  if (!relevant) return "";

  return (
    `From earlier in this candidate's history you know: ${relevant.observation} ` +
    "If it is genuinely relevant to the question you are about to ask, let it naturally shape the " +
    "question's angle or specificity so it probes that ground truthfully — but NEVER reference " +
    'memory, a "previous session", or the candidate\'s history explicitly. The question should read ' +
    "exactly like a well-prepared interviewer who simply knows the material well."
  );
}

/**
 * Builds the prompt for generating a new, non-follow-up interview question.
 * Grounded strictly in the curriculum day handed in via `context.assessment`
 * (already resolved from the real curriculum.json by the caller) — the
 * model is told exactly what material exists and not to go beyond it.
 */
export function buildQuestionPrompt(context) {
  const { assessment, candidateProfile, previousQuestions, memoryContext, avoidHint } = context;

  const system = [
    "You are the question-generation module of an AI technical interviewer.",
    "You generate ONE interview question grounded strictly in the supplied curriculum material.",
    "Respond with ONLY a single JSON object — no prose, no markdown fences — matching exactly:",
    '{"question": string, "focusConcepts": string[]}',
    "focusConcepts should name the specific concepts a strong answer must demonstrate.",
    "Never invent curriculum content that is not provided in the context below.",
    "Use the candidate profile only to calibrate tone/framing (e.g. phrase around their target role or a",
    "project they mentioned) — the technical substance must still come strictly from the curriculum day.",
  ].join("\n");

  const prompt = [
    `Candidate: ${candidateProfile.name ?? "candidate"}, targeting "${candidateProfile.targetRole ?? candidateProfile.jobRole}" ` +
      `(${candidateProfile.yearsExperience} yrs experience, ${candidateProfile.education || "education not provided"}).`,
    candidateProfile.technicalSkills?.length > 0
      ? `Candidate's self-reported technical skills: ${candidateProfile.technicalSkills.join(", ")}.`
      : "",
    candidateProfile.projects?.length > 0
      ? `Candidate's self-reported projects: ${candidateProfile.projects.join("; ")}.`
      : "",
    `Curriculum day ${assessment.curriculumDay} — "${assessment.topic}"${
      assessment.moduleTitle ? ` (module: ${assessment.moduleTitle})` : ""
    }.`,
    `Primary skill/tool: ${assessment.skill}.`,
    `Day objectives: ${(assessment.objectives ?? []).join("; ") || "none provided"}.`,
    `Question type: ${assessment.questionType}. Target difficulty: ${assessment.difficulty}.`,
    previousQuestions?.length > 0
      ? `Already asked this interview (do not repeat or rephrase these): ${previousQuestions.join(" | ")}`
      : "This is the first question of the interview.",
    avoidHint
      ? `Your previous attempt duplicated a prior question: "${avoidHint}". Ask something meaningfully different.`
      : "",
    memoryInstruction(memoryContext, assessment.topic),
    "Generate one question that assesses real understanding of the above material at the target difficulty and type. Return only the JSON object.",
  ]
    .filter(Boolean)
    .join("\n");

  return { system, prompt };
}

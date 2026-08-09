/**
 * Turns one answer evaluation into the small set of structured insights
 * worth remembering long-term (task brief §8) — NOT the raw answer, and not
 * every individual score field. At most one insight per category
 * (strength / knowledge_gap / misconception) per answer, so memory stays
 * useful signal instead of a transcript.
 *
 * This is deliberately pure/synchronous and has no dependency on the memory
 * layer — memoryIntegration.js is what actually writes these out, which
 * keeps this function trivially testable on its own.
 */
function joinList(items) {
  return items.join(", ");
}

export function extractInsights(evaluation, question) {
  const insights = [];
  const topic = question.topic;

  if (evaluation.strengths?.length > 0) {
    insights.push({
      type: "strength",
      topic,
      observation: `Candidate demonstrated solid understanding of ${joinList(evaluation.strengths)} while discussing "${topic}".`,
    });
  }

  const gaps = [...new Set([...(evaluation.missingConcepts ?? []), ...(evaluation.knowledgeGaps ?? [])])];
  if (gaps.length > 0) {
    insights.push({
      type: "knowledge_gap",
      topic,
      observation: `Candidate could not clearly address ${joinList(gaps)} when asked about "${topic}".`,
    });
  }

  if (evaluation.misconceptions?.length > 0) {
    insights.push({
      type: "misconception",
      topic,
      observation: `Candidate's answer suggested a misconception: ${joinList(evaluation.misconceptions)} (topic: "${topic}").`,
    });
  }

  return insights;
}

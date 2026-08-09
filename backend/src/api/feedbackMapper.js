/**
 * Adapts `finalEvaluation.js`'s existing structured output (task brief's
 * internal shape — averages, meetsHackathonMinimums, topicBreakdown, etc.)
 * into exactly the `feedback` shape the hackathon Technical Specification
 * requires:
 *
 *   { summary: string, strengths: string[], gaps: string[], next: string[] }
 *
 * Deliberately a pure, separate adapter rather than a change to
 * `finalEvaluation.js` — the engine's internal final-evaluation shape stays
 * intact for anything else that depends on it; this is presentation-layer
 * mapping for the HTTP contract only.
 *
 * `summary` and `next` are read straight from finalEvaluation's own
 * `narrativeSummary` / `recommendedNextSteps` — both built strictly from
 * this interview's transcript (see finalEvaluation.js), so this mapper adds
 * no generic template text of its own. Falls back to a minimal, still
 * evidence-based line only in the edge case of zero evaluations.
 */

function buildSummary(finalEvaluation) {
  if (finalEvaluation.narrativeSummary) return finalEvaluation.narrativeSummary;
  const { totalQuestions, curriculumDaysCoveredCount, averageScore } = finalEvaluation;
  return (
    `Completed ${totalQuestions} question(s) across ${curriculumDaysCoveredCount} curriculum day(s) ` +
    `with an average score of ${averageScore}/10.`
  );
}

function buildNextSteps(finalEvaluation) {
  if (finalEvaluation.recommendedNextSteps?.length > 0) {
    return finalEvaluation.recommendedNextSteps;
  }
  // No topic scored low enough to need a targeted next step (a strong
  // interview) — still specific to this candidate's actual gap list, not a
  // generic "keep practicing" filler.
  const topics = [...new Set([...finalEvaluation.knowledgeGaps, ...finalEvaluation.weaknesses])];
  return topics.map((topic) => `Review and practice: ${topic}`);
}

export function buildFeedback(finalEvaluation) {
  return {
    summary: buildSummary(finalEvaluation),
    strengths: [...finalEvaluation.strengths],
    gaps: [...new Set([...finalEvaluation.knowledgeGaps, ...finalEvaluation.weaknesses])],
    next: buildNextSteps(finalEvaluation),
  };
}

import { curriculumService } from "../curriculum/curriculum.service.js";

function round1(n) {
  return Math.round(n * 10) / 10;
}

function average(evaluations, key) {
  if (evaluations.length === 0) return 0;
  return round1(evaluations.reduce((sum, e) => sum + (e[key] ?? 0), 0) / evaluations.length);
}

/**
 * Pairs each recorded evaluation with the question it answered (same index,
 * same order — recordQuestion/recordAnswerEvaluation in interviewState.js
 * always push in lockstep), then groups by topic so a topic asked about
 * more than once (a planned question + its adaptive follow-up) is judged as
 * one thread of evidence rather than two disconnected data points.
 *
 * This is the ONLY place "what actually happened in this interview" gets
 * turned into per-topic evidence — everything downstream (the narrative,
 * strengths/gaps lists) is built strictly from this, so nothing in the final
 * feedback can be a claim the transcript doesn't support (task brief
 * "Do not invent evidence").
 */
function buildTopicBreakdown(state) {
  const byTopic = new Map();

  state.questionHistory.forEach((question, index) => {
    const evaluation = state.evaluations[index];
    if (!evaluation) return; // question asked but not yet answered (shouldn't happen at completion)

    const key = question.topic;
    if (!byTopic.has(key)) {
      byTopic.set(key, {
        topic: question.topic,
        curriculumDay: question.curriculumDay,
        questionsAsked: 0,
        scores: [],
        strengths: [],
        missingConcepts: [],
        misconceptions: [],
      });
    }
    const bucket = byTopic.get(key);
    bucket.questionsAsked += 1;
    bucket.scores.push(evaluation.score);
    bucket.strengths.push(...evaluation.strengths);
    bucket.missingConcepts.push(...evaluation.missingConcepts, ...evaluation.knowledgeGaps);
    bucket.misconceptions.push(...evaluation.misconceptions);
  });

  return [...byTopic.values()]
    .map((bucket) => ({
      topic: bucket.topic,
      curriculumDay: bucket.curriculumDay,
      questionsAsked: bucket.questionsAsked,
      averageScore: round1(bucket.scores.reduce((s, v) => s + v, 0) / bucket.scores.length),
      strengths: [...new Set(bucket.strengths)],
      missingConcepts: [...new Set(bucket.missingConcepts)],
      misconceptions: [...new Set(bucket.misconceptions)],
    }))
    .sort((a, b) => b.averageScore - a.averageScore);
}

/** One evidence-grounded sentence per topic, in the style the task brief
 * asks for ("Your explanation of RAG architecture was clear, but your
 * discussion of chunking and retrieval trade-offs was less developed.") —
 * built directly from that topic's own scores/strengths/gaps, never from a
 * generic template. */
function sentenceForTopic(topic) {
  const strong = topic.averageScore >= 7;
  const weak = topic.averageScore < 5;

  if (strong) {
    const detail = topic.strengths[0] ? `, particularly your grasp of ${topic.strengths[0]}` : "";
    return `Your explanation of ${topic.topic} was strong (${topic.averageScore}/10)${detail}.`;
  }
  if (weak) {
    const gap = topic.missingConcepts[0] || topic.misconceptions[0];
    const detail = gap ? `, specifically around ${gap}` : "";
    return `Your discussion of ${topic.topic} was less developed (${topic.averageScore}/10)${detail}.`;
  }
  return `Your answer on ${topic.topic} showed a working but incomplete understanding (${topic.averageScore}/10).`;
}

/** Builds the narrative summary paragraph: overview stats, then the
 * strongest and weakest topic sentences pulled straight from
 * buildTopicBreakdown — no generic filler like "keep practicing AI". */
function buildNarrativeSummary(state, topicBreakdown) {
  const { questionCount, coveredCurriculumDays } = state;
  const overallAverage = average(state.evaluations, "score");

  const overview =
    `Completed ${questionCount} question(s) across ${coveredCurriculumDays.length} curriculum day(s), ` +
    `averaging ${overallAverage}/10.`;

  if (topicBreakdown.length === 0) {
    return overview;
  }

  const strongest = topicBreakdown[0];
  const weakest = topicBreakdown[topicBreakdown.length - 1];

  const sentences = [overview, sentenceForTopic(strongest)];
  if (weakest.topic !== strongest.topic) {
    sentences.push(sentenceForTopic(weakest));
  }
  return sentences.join(" ");
}

/** Grounded, per-topic next steps: for each weak topic, names the real
 * curriculum day and pulls an actual objective from curriculum.json to
 * recommend — never an invented suggestion. */
function buildRecommendedNextSteps(topicBreakdown) {
  return topicBreakdown
    .filter((t) => t.averageScore < 6)
    .map((t) => {
      let objectiveHint = "";
      try {
        const objectives = curriculumService.getObjectives(t.curriculumDay);
        if (objectives.length > 0) objectiveHint = ` — focus on: ${objectives[0]}`;
      } catch {
        // day somehow no longer resolvable; still give a useful, if shorter, next step
      }
      const gapNote = t.missingConcepts[0] ? ` (gap: ${t.missingConcepts[0]})` : "";
      return `Revisit Day ${t.curriculumDay} — ${t.topic}${gapNote}${objectiveHint}.`;
    });
}

/**
 * Aggregates a completed interview's per-question evaluations into a single
 * structured summary. This is data only (JSON), not a report/UI — the final
 * "assessment report" itself is explicitly out of scope for this stage.
 *
 * Beyond the original aggregate fields, this also returns `topicBreakdown`,
 * `narrativeSummary`, and `recommendedNextSteps` — all derived strictly from
 * this interview's own transcript (questionHistory + evaluations), so the
 * feedback demonstrably reflects what the candidate actually said rather
 * than a generic template (task brief "FINAL FEEDBACK").
 */
export function buildFinalEvaluation(state) {
  const evaluations = state.evaluations;
  const topicBreakdown = buildTopicBreakdown(state);

  return {
    interviewId: state.interviewId,
    candidateId: state.candidateId,
    totalQuestions: state.questionCount,
    curriculumDaysCovered: state.coveredCurriculumDays,
    curriculumDaysCoveredCount: state.coveredCurriculumDays.length,
    averageScore: average(evaluations, "score"),
    averageCorrectness: average(evaluations, "correctness"),
    averageDepth: average(evaluations, "depth"),
    averageReasoning: average(evaluations, "reasoning"),
    averageClarity: average(evaluations, "clarity"),
    strengths: [...new Set(state.strengths)],
    knowledgeGaps: [...new Set(state.knowledgeGaps)],
    weaknesses: [...new Set(state.weaknesses)],
    topicBreakdown,
    narrativeSummary: buildNarrativeSummary(state, topicBreakdown),
    recommendedNextSteps: buildRecommendedNextSteps(topicBreakdown),
    meetsHackathonMinimums: {
      atLeast8Questions: state.questionCount >= 8,
      atLeast4Days: state.coveredCurriculumDays.length >= 4,
    },
    generatedAt: new Date().toISOString(),
  };
}

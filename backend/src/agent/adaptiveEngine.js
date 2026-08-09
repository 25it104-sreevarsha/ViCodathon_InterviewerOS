import { ValidationError } from "../utils/errors.js";

const DIFFICULTY_ORDER = ["easy", "medium", "hard"];
const MAX_QUESTIONS = 10;
const MAX_CONSECUTIVE_FOLLOWUPS = 1; // probe a gap once, then move on — don't spiral on one topic

function bumpDifficulty(current, delta) {
  const idx = DIFFICULTY_ORDER.indexOf(current);
  const safeIdx = idx === -1 ? 1 : idx;
  const next = Math.min(DIFFICULTY_ORDER.length - 1, Math.max(0, safeIdx + delta));
  return DIFFICULTY_ORDER[next];
}

/**
 * The core differentiator of Interviewer OS: decides the NEXT assessment
 * from the candidate's most recent evaluation, not a fixed question list.
 *
 *   strong answer (score >= 8)  -> advance to the next planned day,
 *                                  but bump its difficulty up a notch
 *   weak answer (score < 4)     -> stay on the same topic, targeted
 *                                  follow-up probing the specific gap,
 *                                  one difficulty notch down
 *   partial answer, flagged     -> same-topic follow-up at the same
 *   for follow-up                 difficulty (clarify before moving on)
 *   otherwise / follow-up        -> advance to the next planned day at
 *   budget already used            its planned difficulty
 *
 * Returns `null` when the interview should end (plan exhausted, or the
 * 10-question hard cap is reached) — the orchestrator is responsible for
 * turning that into a "completed" status + final evaluation.
 */
function decideNext({ state, plan }) {
  const latest = state.evaluations[state.evaluations.length - 1];
  if (!latest) {
    throw new ValidationError("adaptiveEngine.decideNext requires at least one recorded evaluation.");
  }
  if (state.questionCount >= MAX_QUESTIONS) {
    return null;
  }

  const strong = latest.score >= 8;
  const weak = latest.score < 4;
  const partial = !strong && !weak;

  const hasTargetableGap = latest.missingConcepts.length > 0 || latest.misconceptions.length > 0;
  const shouldFollowUp =
    (weak || (partial && latest.shouldFollowUp)) &&
    hasTargetableGap &&
    state.consecutiveFollowUps < MAX_CONSECUTIVE_FOLLOWUPS;

  if (shouldFollowUp) {
    const lastQuestion = state.questionHistory[state.questionHistory.length - 1];
    return {
      source: "followup",
      isFollowUp: true,
      questionNumber: state.questionCount + 1,
      curriculumDay: lastQuestion.curriculumDay,
      topic: lastQuestion.topic,
      skill: lastQuestion.skill,
      moduleTitle: lastQuestion.moduleTitle,
      objectives: lastQuestion.objectives,
      questionType: lastQuestion.questionType,
      difficulty: weak ? bumpDifficulty(state.currentDifficulty, -1) : state.currentDifficulty,
      focusConcepts: latest.missingConcepts.length > 0 ? latest.missingConcepts : latest.misconceptions,
    };
  }

  const nextIndex = state.planCursor + 1;
  if (nextIndex >= plan.entries.length) {
    return null; // plan material exhausted
  }

  const nextEntry = plan.entries[nextIndex];
  return {
    source: "plan",
    isFollowUp: false,
    questionNumber: state.questionCount + 1,
    planIndex: nextIndex,
    curriculumDay: nextEntry.curriculumDay,
    topic: nextEntry.topic,
    skill: nextEntry.skill,
    moduleTitle: nextEntry.moduleTitle,
    objectives: nextEntry.objectives,
    questionType: nextEntry.questionType,
    difficulty: strong ? bumpDifficulty(nextEntry.difficulty, 1) : nextEntry.difficulty,
  };
}

export const adaptiveEngine = { decideNext };

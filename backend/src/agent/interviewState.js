import crypto from "node:crypto";
import { NotFoundError } from "../utils/errors.js";

const INITIAL_DIFFICULTY = "medium";

/**
 * Creates a fresh interview state for a candidate + plan.
 *
 * Fields beyond the ones named in the task brief (`plan`, `planCursor`,
 * `consecutiveFollowUps`, `finalEvaluation`) are implementation details the
 * adaptive engine and orchestrator need to do their job correctly — they're
 * additive, not a departure from the requested shape.
 */
export function createInterviewState(candidateId, plan) {
  const now = new Date().toISOString();
  return {
    interviewId: crypto.randomUUID(),
    candidateId,
    plan, // the interviewPlanner output this interview is following
    status: "in_progress", // "in_progress" | "completed"
    currentQuestion: null,
    questionHistory: [],
    answerHistory: [],
    evaluations: [],
    coveredCurriculumDays: [],
    coveredTopics: [],
    currentDifficulty: INITIAL_DIFFICULTY,
    knowledgeGaps: [],
    strengths: [],
    weaknesses: [],
    questionCount: 0,
    planCursor: 0, // index into plan.entries of the last plan-sourced question
    consecutiveFollowUps: 0,
    finalEvaluation: null,
    createdAt: now,
    updatedAt: now,
  };
}

function mergeUnique(existing, incoming) {
  return [...new Set([...existing, ...incoming])];
}

/** Records a newly generated question as the active question. */
export function recordQuestion(state, question) {
  return {
    ...state,
    currentQuestion: question,
    questionHistory: [...state.questionHistory, question],
    questionCount: state.questionCount + 1,
    planCursor: question.isFollowUp ? state.planCursor : question.planIndex ?? state.planCursor,
    currentDifficulty: question.difficulty ?? state.currentDifficulty,
    consecutiveFollowUps: question.isFollowUp ? state.consecutiveFollowUps + 1 : 0,
    updatedAt: new Date().toISOString(),
  };
}

/** Records the candidate's answer and its evaluation against the current question. */
export function recordAnswerEvaluation(state, answerText, evaluation) {
  const q = state.currentQuestion;
  const isWeakOnTopic = evaluation.score < 6 || evaluation.missingConcepts.length > 0;

  return {
    ...state,
    answerHistory: [...state.answerHistory, { questionNumber: q.questionNumber, answerText }],
    evaluations: [...state.evaluations, evaluation],
    coveredCurriculumDays: mergeUnique(state.coveredCurriculumDays, [q.curriculumDay]),
    coveredTopics: mergeUnique(state.coveredTopics, [q.topic]),
    knowledgeGaps: mergeUnique(state.knowledgeGaps, evaluation.knowledgeGaps),
    strengths: mergeUnique(state.strengths, evaluation.strengths),
    weaknesses: mergeUnique(state.weaknesses, isWeakOnTopic ? [q.topic] : []),
    updatedAt: new Date().toISOString(),
  };
}

/** Marks an interview finished and attaches its computed final evaluation. */
export function markCompleted(state, finalEvaluation) {
  return {
    ...state,
    status: "completed",
    currentQuestion: null,
    finalEvaluation,
    updatedAt: new Date().toISOString(),
  };
}

// --- Repository abstraction -------------------------------------------
//
// In-memory only, deliberately (task brief §6: no database yet). Every
// method a persistent implementation would need — save/get/list/delete — is
// already isolated here behind this one object. Swapping to a real database
// later means reimplementing this object's methods against a store; nothing
// in interviewPlanner/questionGenerator/answerEvaluator/adaptiveEngine or the
// orchestrator talks to `store` directly, so nothing else needs to change.
const store = new Map();

export const interviewStateRepository = {
  save(state) {
    store.set(state.interviewId, state);
    return state;
  },
  get(interviewId) {
    const state = store.get(interviewId);
    if (!state) {
      throw new NotFoundError(`No interview found with id '${interviewId}'.`);
    }
    return state;
  },
  list() {
    return [...store.values()];
  },
  delete(interviewId) {
    store.delete(interviewId);
  },
  /** Test/dev helper — clears all in-memory interviews. */
  clear() {
    store.clear();
  },
};

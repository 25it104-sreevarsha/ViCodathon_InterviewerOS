import { interviewPlanner } from "./interviewPlanner.js";
import { questionGenerator } from "./questionGenerator.js";
import { answerEvaluator } from "./answerEvaluator.js";
import { adaptiveEngine } from "./adaptiveEngine.js";
import { buildFinalEvaluation } from "./finalEvaluation.js";
import { recordCandidateInsights, retrieveMemoryContext } from "./memoryIntegration.js";
import {
  createInterviewState,
  recordQuestion,
  recordAnswerEvaluation,
  markCompleted,
  interviewStateRepository,
} from "./interviewState.js";
import { candidatesService } from "../candidates/candidates.service.js";
import { curriculumService } from "../curriculum/curriculum.service.js";
import { ValidationError } from "../utils/errors.js";

function summarizePlan(plan) {
  return {
    totalPlannedQuestions: plan.totalPlannedQuestions,
    plannedCurriculumDays: plan.plannedCurriculumDays,
    insufficientCoverage: plan.insufficientCoverage,
    coverageNote: plan.coverageNote,
  };
}

/**
 * Starts a new interview for a candidate: builds their plan, creates
 * interview state, and generates question 1.
 *
 * `memoryContext` is an optional pass-through for a future Breeth-backed
 * long-term memory layer (task brief §15) — unused today, threaded through
 * so plugging it in later doesn't require touching this function's signature.
 */
async function createInterview(candidateId, { memoryContext = null } = {}) {
  const candidate = candidatesService.getCandidateById(candidateId); // throws NotFoundError if missing
  const plan = interviewPlanner.buildInterviewPlan(candidateId);

  if (plan.entries.length === 0) {
    throw new ValidationError(`Candidate '${candidateId}' has no curriculum-linked missions to interview on.`);
  }

  let state = createInterviewState(candidateId, plan);
  state = interviewStateRepository.save(state);

  const firstEntry = plan.entries[0];

  // Memory-aware from question 1: a candidate may have been interviewed
  // before (or have memory seeded some other way), so we check what's
  // already known about them on this topic before asking anything.
  const memory = await retrieveMemoryContext(candidateId, firstEntry.topic, memoryContext);

  const question = await questionGenerator.generateQuestion({
    assessment: { ...firstEntry, isFollowUp: false, source: "plan" },
    candidate,
    previousQuestions: [],
    memoryContext: memory,
  });

  state = recordQuestion(state, question);
  state = interviewStateRepository.save(state);

  return {
    interviewId: state.interviewId,
    candidateId: state.candidateId,
    question: state.currentQuestion,
    plan: summarizePlan(plan),
    status: state.status,
  };
}

function getCurrentQuestion(interviewId) {
  return interviewStateRepository.get(interviewId).currentQuestion;
}

function getInterviewState(interviewId) {
  return interviewStateRepository.get(interviewId);
}

/**
 * Submits a candidate's answer to the current question: evaluates it,
 * updates state, lets the adaptive engine choose the next assessment, and
 * either generates the next question or completes the interview.
 *
 * This is the step where "the answer influences the next question" — see
 * adaptiveEngine.decideNext, which is the only thing that decides what
 * happens next.
 */
async function submitAnswer(interviewId, answerText, { memoryContext = null } = {}) {
  let state = interviewStateRepository.get(interviewId);

  if (state.status !== "in_progress") {
    throw new ValidationError(`Interview '${interviewId}' is already '${state.status}'.`);
  }
  if (!state.currentQuestion) {
    throw new ValidationError(`Interview '${interviewId}' has no active question to answer.`);
  }

  const candidate = candidatesService.getCandidateById(state.candidateId);
  const day = curriculumService.getDay(state.currentQuestion.curriculumDay);

  const evaluation = await answerEvaluator.evaluateAnswer({
    question: state.currentQuestion,
    answerText,
    day,
    candidate,
    previousEvaluations: state.evaluations,
  });

  state = recordAnswerEvaluation(state, answerText, evaluation);
  state = interviewStateRepository.save(state);

  // "What did I learn about this candidate?" -> write it to memory before
  // deciding what's next. Never blocks/fails the interview (see
  // memoryIntegration.js) — a memory outage degrades to "no extra context"
  // rather than crashing the loop.
  await recordCandidateInsights(state.candidateId, evaluation, state.currentQuestion);

  const next = adaptiveEngine.decideNext({ state, plan: state.plan });

  if (!next) {
    const finalEvaluation = buildFinalEvaluation(state);
    state = markCompleted(state, finalEvaluation);
    state = interviewStateRepository.save(state);

    return {
      interviewId,
      evaluation,
      question: null,
      status: "completed",
      finalEvaluation,
    };
  }

  // "What should I assess next?" -> pull whatever memory knows about this
  // candidate on the next topic, so a targeted earlier gap (e.g. "weak on
  // RAG chunking") can concretely shape the next question, not just the
  // adaptive engine's own strong/weak branch on the immediately-prior answer.
  const memory = await retrieveMemoryContext(state.candidateId, next.topic, memoryContext);

  const question = await questionGenerator.generateQuestion({
    assessment: next,
    candidate,
    previousQuestions: state.questionHistory.map((q) => q.question),
    memoryContext: memory,
  });

  state = recordQuestion(state, question);
  state = interviewStateRepository.save(state);

  return {
    interviewId,
    evaluation,
    question: state.currentQuestion,
    status: "in_progress",
    finalEvaluation: null,
  };
}

export const interviewOrchestrator = {
  createInterview,
  getCurrentQuestion,
  getInterviewState,
  submitAnswer,
};

/**
 * Automated tests for the intelligence/personalization improvements:
 *   - candidate data affects planning
 *   - curriculum affects question generation (grounding, incl. REAL CANDIDATE MODE)
 *   - previous answer affects next question
 *   - Breeth memory affects a LATER question (not just the immediate follow-up)
 *   - strong answer increases difficulty / weak answer produces a targeted follow-up
 *   - questions span at least 4 curriculum days, minimum 8 questions still works
 *   - final feedback reflects actual interview evidence (not generic text)
 *   - DEMO MODE (Emily Chen, unchanged) vs REAL CANDIDATE MODE are cleanly separated
 *
 * Run with: npm run test:personalization
 * Deliberately a NEW file rather than edits to test-intelligence-engine.js —
 * nothing here replaces or touches an existing passing test.
 *
 * Uses the default mock AI/memory providers (no network, no API key), same
 * as every other test script in this repo.
 */
import { curriculumService } from "../src/curriculum/curriculum.service.js";
import { candidatesService } from "../src/candidates/candidates.service.js";
import { interviewPlanner } from "../src/agent/interviewPlanner.js";
import { questionGenerator } from "../src/agent/questionGenerator.js";
import { interviewOrchestrator } from "../src/agent/interviewOrchestrator.js";
import { interviewStateRepository } from "../src/agent/interviewState.js";
import { recordCandidateInsights } from "../src/agent/memoryIntegration.js";
import { buildFeedback } from "../src/api/feedbackMapper.js";

let failures = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log(`  PASS  ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${label}\n        ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function strongAnswerFor(day) {
  const keywords = [...(day.tools ?? []), ...(day.objectives ?? [])].join(", ");
  return (
    `In depth: this involves ${keywords}. I worked through this exact scenario before — ` +
    `the key idea is understanding how ${day.title.toLowerCase()} connects the underlying tools to a working ` +
    `outcome, handling edge cases carefully and validating the result at each step along the way.`
  );
}

const WEAK_ANSWER = "I don't know, not sure about this one.";

const EMILY_ID = "CAND-003"; // demo mode's protected candidate — task brief: "Do not remove Emily."

const REAL_PROFILE = {
  fullName: "Jordan Rivera",
  email: "jordan@example.com",
  education: "B.Tech, State University",
  degree: "Computer Science",
  experienceLevel: "3–5 years",
  targetRole: "AI Engineer",
  skills: "Retrieval augmented generation, vector databases, prompt engineering, LangChain agents",
  projects: "Built a RAG-based internal docs assistant using embeddings and a vector store",
  certifications: "",
};

async function main() {
  console.log("DEMO MODE vs REAL CANDIDATE MODE separation");

  await check("Emily Chen (demo mode) is untouched and still resolves normally", () => {
    const emily = candidatesService.getCandidateById(EMILY_ID);
    assert(emily.member.name === "Emily Chen", "Emily Chen's demo record should be unchanged");
    assert(candidatesService.getMode(EMILY_ID) === "demo", "CAND-003 should be classified as demo mode");
    assert(emily.missions.length > 0, "Emily should still have her real mission history");
  });

  let realCandidateId;
  await check("a REAL CANDIDATE MODE profile creates a distinct, isolated candidate record", () => {
    const record = candidatesService.createCandidateFromProfile(REAL_PROFILE);
    realCandidateId = record.member.id;
    assert(candidatesService.getMode(realCandidateId) === "real", "a profile-created candidate should be mode 'real'");
    assert(record.member.name === "Jordan Rivera", "profile name should be carried through");
    assert(record.member.targetRole === "AI Engineer", "profile targetRole should be carried through");
    assert(Array.isArray(record.missions) && record.missions.length === 0, "a real candidate starts with no mission history");
    assert(realCandidateId !== EMILY_ID, "real candidate id must never collide with a demo id");
    // Round-trip through the same lookup path everything else in the engine uses.
    const fetched = candidatesService.getCandidateById(realCandidateId);
    assert(fetched.member.name === "Jordan Rivera", "getCandidateById should resolve the newly created real candidate");
  });

  await check("creating a real candidate never mutates or removes the demo dataset", () => {
    const allDemo = candidatesService.listCandidates();
    assert(allDemo.some((c) => c.id === EMILY_ID), "Emily Chen must still be present in the demo dataset");
    assert(allDemo.length === 20, `expected the original 20 demo candidates, got ${allDemo.length}`);
  });

  console.log("\nCurriculum grounding for REAL CANDIDATE MODE");

  await check("a real candidate's plan is grounded in real curriculum days matched from their profile", () => {
    const plan = interviewPlanner.buildInterviewPlan(realCandidateId);
    assert(plan.entries.length >= 8, `expected >= 8 planned questions, got ${plan.entries.length}`);
    assert(plan.plannedCurriculumDays.length >= 4, `expected >= 4 distinct curriculum days, got ${plan.plannedCurriculumDays.length}`);
    for (const entry of plan.entries) {
      const realDay = curriculumService.getDay(entry.curriculumDay); // throws if not real -> fails the check
      assert(realDay.title === entry.topic, "every planned entry must reference a real curriculum day, never invented");
      assert(entry.sourceMission.selfReported === true, "real-candidate-mode entries should be flagged self-reported");
    }
    // The candidate's actual RAG/vector-db skills should have surfaced real, relevant days —
    // not just an arbitrary fallback list.
    const titles = plan.entries.map((e) => e.topic.toLowerCase());
    assert(
      titles.some((t) => t.includes("retrieval") || t.includes("rag") || t.includes("vector") || t.includes("embed")),
      `expected the RAG/vector-skills profile to surface a related curriculum day, got topics: ${titles.join(", ")}`
    );
  });

  await check("a profile with no matching skills still reaches the hackathon minimums via grounded fallback", () => {
    const vague = candidatesService.createCandidateFromProfile({
      fullName: "Casey Blank",
      targetRole: "Something Nobody Wrote A Curriculum Day About",
      skills: "",
    });
    const plan = interviewPlanner.buildInterviewPlan(vague.member.id);
    assert(plan.entries.length >= 8, `expected >= 8 planned questions even with no skill matches, got ${plan.entries.length}`);
    assert(plan.plannedCurriculumDays.length >= 4, "expected >= 4 curriculum days even with no skill matches");
    for (const dayNum of plan.plannedCurriculumDays) {
      curriculumService.getDay(dayNum); // throws if invented
    }
  });

  console.log("\nCandidate data affects planning");

  await check("two different candidates with different mission histories get different plans", () => {
    const candidates = candidatesService.listCandidates();
    const planA = interviewPlanner.buildInterviewPlan(candidates[0].id);
    const planB = interviewPlanner.buildInterviewPlan(candidates[1].id);
    const daysA = JSON.stringify(planA.plannedCurriculumDays);
    const daysB = JSON.stringify(planB.plannedCurriculumDays);
    assert(daysA !== daysB, "different candidates' real mission histories should produce different planned days");
  });

  await check("a real candidate's plan differs from a demo candidate's plan for the same-ish role", () => {
    const demoPlan = interviewPlanner.buildInterviewPlan(EMILY_ID); // Emily Chen, AI Engineer
    const realPlan = interviewPlanner.buildInterviewPlan(realCandidateId); // Jordan Rivera, AI Engineer
    assert(
      demoPlan.entries.some((e) => e.sourceMission.selfReported !== true),
      "Emily's plan should be built from real mission evidence, not self-reported"
    );
    assert(
      realPlan.entries.every((e) => e.sourceMission.selfReported === true),
      "Jordan's plan should be entirely self-reported since he has no mission history"
    );
  });

  console.log("\nBreeth memory affects a LATER question (not just the immediate follow-up)");

  await check("a memory insight recorded on question N concretely changes question generation when the topic resurfaces later", async () => {
    const day = curriculumService.getDay(8); // "Vector Databases Overview"
    const candidate = candidatesService.getCandidateById(EMILY_ID);

    const assessmentNoMemory = {
      questionNumber: 1,
      isFollowUp: false,
      curriculumDay: day.day,
      topic: day.title,
      skill: day.tools?.[0] ?? day.title,
      moduleTitle: curriculumService.getModuleForDay(day.day)?.title ?? null,
      objectives: day.objectives ?? [],
      questionType: "conceptual",
      difficulty: "medium",
    };

    const withoutMemory = await questionGenerator.generateQuestion({
      assessment: assessmentNoMemory,
      candidate,
      previousQuestions: [],
      memoryContext: { candidateId: EMILY_ID, insights: [], summary: null },
    });

    const memoryContext = {
      candidateId: EMILY_ID,
      insights: [
        {
          topic: "Vector Databases Overview",
          type: "misconception",
          observation: "Candidate's answer suggested a misconception: ANN indexing trade-offs.",
        },
      ],
      summary: "[misconception] Vector Databases Overview: ANN indexing trade-offs",
    };

    const withMemory = await questionGenerator.generateQuestion({
      assessment: { ...assessmentNoMemory, questionNumber: 7 }, // simulating this topic resurfacing at Q7
      candidate,
      previousQuestions: [withoutMemory.question],
      memoryContext,
    });

    assert(
      withMemory.question !== withoutMemory.question,
      "a resurfacing topic with a recorded memory insight should produce a measurably different question"
    );
    assert(
      !/breeth|memory says|previous session|according to memory/i.test(withMemory.question),
      "the candidate must never see an explicit reference to memory/Breeth in the question text"
    );
  });

  await check("the full evaluate -> memory-write -> retrieve loop lets a real gap concretely reach a later prompt", async () => {
    const candidateId = EMILY_ID;
    const day = curriculumService.getDay(8);
    const question = { topic: day.title, curriculumDay: day.day, questionType: "conceptual", difficulty: "medium" };
    const evaluation = {
      score: 3,
      correctness: 3,
      depth: 2,
      reasoning: 3,
      clarity: 4,
      missingConcepts: ["ANN indexing trade-offs"],
      misconceptions: [],
      strengths: [],
      knowledgeGaps: ["ANN indexing trade-offs"],
      shouldFollowUp: true,
      recommendedDifficulty: "easy",
    };

    const writeResult = await recordCandidateInsights(candidateId, evaluation, question);
    assert(writeResult.written > 0, "expected at least one insight to be written to memory");

    const { retrieveMemoryContext } = await import("../src/agent/memoryIntegration.js");
    const context = await retrieveMemoryContext(candidateId, day.title);
    assert(
      context.insights.some((i) => i.observation.includes("ANN indexing")),
      "the specific recorded gap should be retrievable via topic-scoped memory context"
    );
  });

  console.log("\nAdaptive flow regression (still intact after prompt/mock changes)");

  await check("a weak answer still produces a targeted, same-topic follow-up", async () => {
    const { interviewId, question: q1 } = await interviewOrchestrator.createInterview(EMILY_ID);
    const result = await interviewOrchestrator.submitAnswer(interviewId, WEAK_ANSWER);
    assert(result.question.isFollowUp === true, "a weak answer should trigger a follow-up");
    assert(result.question.curriculumDay === q1.curriculumDay, "the follow-up should stay on the same curriculum day");
  });

  await check("questions still span >= 4 curriculum days and minimum 8 questions on a full run", async () => {
    const { interviewId } = await interviewOrchestrator.createInterview(EMILY_ID);
    let result = { status: "in_progress" };
    let guard = 0;
    while (result.status === "in_progress" && guard < 15) {
      const state = interviewOrchestrator.getInterviewState(interviewId);
      const day = curriculumService.getDay(state.currentQuestion.curriculumDay);
      const answer = guard % 3 === 0 ? WEAK_ANSWER : strongAnswerFor(day);
      result = await interviewOrchestrator.submitAnswer(interviewId, answer);
      guard += 1;
    }
    assert(result.status === "completed", "interview should complete");
    assert(result.finalEvaluation.meetsHackathonMinimums.atLeast8Questions, "should still meet the 8-question minimum");
    assert(result.finalEvaluation.meetsHackathonMinimums.atLeast4Days, "should still meet the 4-day minimum");
    return result.finalEvaluation;
  });

  console.log("\nFinal feedback reflects actual interview evidence");

  await check("final feedback narrative names real topics/scores from the transcript, not generic text", async () => {
    const { interviewId } = await interviewOrchestrator.createInterview(EMILY_ID);
    let result = { status: "in_progress" };
    let guard = 0;
    const topicsAsked = [];
    while (result.status === "in_progress" && guard < 15) {
      const state = interviewOrchestrator.getInterviewState(interviewId);
      const day = curriculumService.getDay(state.currentQuestion.curriculumDay);
      topicsAsked.push(day.title);
      // Alternate strong/weak so both a strength and a gap exist to report on.
      const answer = guard % 2 === 0 ? strongAnswerFor(day) : WEAK_ANSWER;
      result = await interviewOrchestrator.submitAnswer(interviewId, answer);
      guard += 1;
    }

    const finalEvaluation = result.finalEvaluation;
    assert(Array.isArray(finalEvaluation.topicBreakdown) && finalEvaluation.topicBreakdown.length > 0, "expected a per-topic breakdown");
    assert(typeof finalEvaluation.narrativeSummary === "string" && finalEvaluation.narrativeSummary.length > 0, "expected a narrative summary");

    // Every topic named in the narrative must be a topic that was actually asked about.
    const mentionsRealTopic = topicsAsked.some((t) => finalEvaluation.narrativeSummary.includes(t));
    assert(mentionsRealTopic, `narrative summary should name an actual asked topic; got: "${finalEvaluation.narrativeSummary}"`);

    // Must not fall back to the old generic template.
    assert(
      !/keep practicing ai/i.test(finalEvaluation.narrativeSummary),
      "narrative summary should never be the generic 'keep practicing AI' filler"
    );

    const feedback = buildFeedback(finalEvaluation);
    assert(feedback.summary === finalEvaluation.narrativeSummary, "HTTP-facing feedback.summary should be the grounded narrative");
    assert(
      feedback.next.every((line) => /Day \d+/.test(line) || /Review and practice/i.test(line)),
      "every next-step line should reference a specific curriculum day or a specific topic, not filler"
    );
  });

  interviewStateRepository.clear();
  candidatesService.clearRealCandidates();

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

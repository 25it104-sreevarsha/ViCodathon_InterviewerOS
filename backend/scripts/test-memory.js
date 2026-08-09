/**
 * Automated tests for the Breeth memory integration (Part 3).
 * Run with: npm run test:memory
 *
 * Runs entirely against MEMORY_PROVIDER=mock (the default — see
 * config/env.js) so these are fast, free, and deterministic: no network
 * call, no Breeth credential. This is what task brief §18 requires ("Tests
 * must NOT require real Breeth credentials").
 */
import { candidatesService } from "../src/candidates/candidates.service.js";
import { curriculumService } from "../src/curriculum/curriculum.service.js";
import { memoryProvider } from "../src/memory/memoryProvider.js";
import { mockMemoryProvider } from "../src/memory/mockMemoryProvider.js";
import { breethMemoryProvider } from "../src/memory/breethMemoryProvider.js";
import { extractInsights } from "../src/agent/insightExtractor.js";
import { recordCandidateInsights, retrieveMemoryContext } from "../src/agent/memoryIntegration.js";
import { questionGenerator } from "../src/agent/questionGenerator.js";
import { interviewOrchestrator } from "../src/agent/interviewOrchestrator.js";
import { interviewStateRepository } from "../src/agent/interviewState.js";

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

const candidates = candidatesService.listCandidates();
const CANDIDATE_A = candidates[0].id;
const CANDIDATE_B = candidates.length > 1 ? candidates[1].id : candidates[0].id;

function strongAnswerFor(day) {
  const keywords = [...(day.tools ?? []), ...(day.objectives ?? [])].join(", ");
  return (
    `In depth: this involves ${keywords}. I worked through this exact scenario before — ` +
    `the key idea is understanding how ${day.title.toLowerCase()} connects the underlying tools to a working ` +
    `outcome, handling edge cases carefully and validating the result at each step along the way.`
  );
}
const WEAK_ANSWER = "I don't know, not sure about this one.";

async function main() {
  console.log(`Memory provider in use: ${memoryProvider.name()}`);
  mockMemoryProvider.clear();

  console.log("\nMemory provider interface (mock)");

  await check("write stores an insight scoped to the candidate", async () => {
    const result = await memoryProvider.write({
      candidateId: CANDIDATE_A,
      insight: { type: "strength", topic: "Embeddings Explained", observation: "Clearly explained vector similarity." },
    });
    assert(result.ok === true, "write should report ok: true");
    assert(typeof result.id === "string" && result.id.length > 0, "write should return an id");
  });

  await check("search finds a previously written insight by relevant query", async () => {
    await memoryProvider.write({
      candidateId: CANDIDATE_A,
      insight: { type: "knowledge_gap", topic: "RAG chunking", observation: "Could not explain chunk-size vs retrieval-precision trade-offs." },
    });
    const { results } = await memoryProvider.search({ candidateId: CANDIDATE_A, query: "RAG chunking trade-offs", limit: 5 });
    assert(results.length > 0, "expected at least one matching result");
    assert(
      results.some((r) => r.observation.toLowerCase().includes("chunk")),
      "expected the chunking insight to be found"
    );
  });

  await check("search/memory is isolated per candidate (group_id boundary)", async () => {
    mockMemoryProvider.clear();
    await memoryProvider.write({
      candidateId: CANDIDATE_A,
      insight: { type: "misconception", topic: "Vector databases", observation: "Described similarity as keyword matching." },
    });
    const contextB = await memoryProvider.getCandidateContext({ candidateId: CANDIDATE_B, topic: "Vector databases" });
    assert(contextB.insights.length === 0, "candidate B should not see candidate A's memory");
  });

  await check("getCandidateContext returns an empty, non-null context for a candidate with no memory", async () => {
    mockMemoryProvider.clear();
    const context = await memoryProvider.getCandidateContext({ candidateId: CANDIDATE_A, topic: "anything" });
    assert(Array.isArray(context.insights) && context.insights.length === 0, "expected empty insights array");
    assert(context.summary === null, "expected null summary when nothing is stored yet");
  });

  console.log("\nInsight extraction");

  await check("extractInsights derives strength/knowledge_gap/misconception from an evaluation", () => {
    const evaluation = {
      score: 4,
      strengths: ["explained retrieval basics"],
      missingConcepts: ["chunk size trade-offs"],
      knowledgeGaps: ["retrieval precision"],
      misconceptions: ["treated cosine similarity as exact match"],
    };
    const question = { topic: "RAG chunking" };
    const insights = extractInsights(evaluation, question);

    assert(insights.length === 3, `expected 3 insights (strength/gap/misconception), got ${insights.length}`);
    assert(insights.every((i) => i.topic === "RAG chunking"), "every insight should carry the question topic");
    assert(insights.some((i) => i.type === "strength"), "expected a strength insight");
    assert(insights.some((i) => i.type === "knowledge_gap"), "expected a knowledge_gap insight");
    assert(insights.some((i) => i.type === "misconception"), "expected a misconception insight");
  });

  await check("extractInsights returns no insights when an evaluation has nothing notable", () => {
    const evaluation = { score: 6, strengths: [], missingConcepts: [], knowledgeGaps: [], misconceptions: [] };
    const insights = extractInsights(evaluation, { topic: "Anything" });
    assert(insights.length === 0, "expected no insights for a neutral evaluation with no signal");
  });

  console.log("\nAdaptive memory flow (evaluation -> insight -> memory -> retrieval)");

  await check("recordCandidateInsights writes insights that become retrievable via getCandidateContext", async () => {
    mockMemoryProvider.clear();
    const evaluation = {
      score: 3,
      strengths: [],
      missingConcepts: ["chunking strategy"],
      knowledgeGaps: ["chunk overlap"],
      misconceptions: [],
    };
    const question = { topic: "RAG Deep Dive" };

    const outcome = await recordCandidateInsights(CANDIDATE_A, evaluation, question);
    assert(outcome.written === 1, `expected exactly 1 insight written (only a gap was present), got ${outcome.written}`);

    const context = await retrieveMemoryContext(CANDIDATE_A, "RAG Deep Dive");
    assert(context.insights.length > 0, "expected the written gap to come back from retrieval");
    assert(context.summary?.includes("knowledge_gap"), "expected the summary to tag the insight's type");
  });

  await check("retrieveMemoryContext preserves an externally-supplied memoryContext alongside retrieved memory", async () => {
    mockMemoryProvider.clear();
    const merged = await retrieveMemoryContext(CANDIDATE_A, "anything", { note: "caller-supplied" });
    assert(merged.external?.note === "caller-supplied", "expected the external context to be preserved under `external`");
  });

  await check("a knowledge gap recorded on one question concretely reaches the next question's prompt context", async () => {
    mockMemoryProvider.clear();
    const originalGenerateQuestion = questionGenerator.generateQuestion;
    const capturedMemoryContexts = [];

    questionGenerator.generateQuestion = async (input) => {
      capturedMemoryContexts.push(input.memoryContext);
      return originalGenerateQuestion(input);
    };

    try {
      const { interviewId, question: q1 } = await interviewOrchestrator.createInterview(CANDIDATE_A);
      const day1 = curriculumService.getDay(q1.curriculumDay);
      // A weak/hedging answer guarantees a knowledge_gap insight gets written
      // (see mockAiProvider.scoreAnswer's hedge-phrase branch).
      await interviewOrchestrator.submitAnswer(interviewId, WEAK_ANSWER);

      assert(capturedMemoryContexts.length >= 2, "expected memoryContext to be captured for at least 2 question generations");
      const secondCallContext = capturedMemoryContexts[1];
      assert(
        secondCallContext && secondCallContext.insights.length > 0,
        "expected the second question's memoryContext to carry the insight written after question 1"
      );
      assert(
        secondCallContext.insights.some((i) => i.topic === day1.title),
        `expected retrieved memory to reference topic "${day1.title}"`
      );
    } finally {
      questionGenerator.generateQuestion = originalGenerateQuestion;
      interviewStateRepository.clear();
    }
  });

  console.log("\nFull interview run with memory");

  await check("a full interview accumulates candidate memory across multiple questions", async () => {
    mockMemoryProvider.clear();
    const { interviewId } = await interviewOrchestrator.createInterview(CANDIDATE_A);
    let result = { status: "in_progress" };
    let guard = 0;
    while (result.status === "in_progress" && guard < 15) {
      const state = interviewOrchestrator.getInterviewState(interviewId);
      const day = curriculumService.getDay(state.currentQuestion.curriculumDay);
      const answer = guard % 3 === 0 ? WEAK_ANSWER : strongAnswerFor(day);
      result = await interviewOrchestrator.submitAnswer(interviewId, answer);
      guard += 1;
    }
    assert(result.status === "completed", "expected the interview to complete");

    const context = await memoryProvider.getCandidateContext({ candidateId: CANDIDATE_A });
    assert(context.insights.length > 0, "expected accumulated memory after a full interview run");
    interviewStateRepository.clear();
  });

  console.log("\nFailure handling");

  await check("a memory write failure does not break submitAnswer (graceful degradation)", async () => {
    mockMemoryProvider.clear();
    const { interviewId } = await interviewOrchestrator.createInterview(CANDIDATE_A);

    const originalWrite = mockMemoryProvider.write;
    mockMemoryProvider.write = async () => {
      throw new Error("simulated Breeth outage");
    };

    try {
      const result = await interviewOrchestrator.submitAnswer(interviewId, WEAK_ANSWER);
      assert(
        result.status === "in_progress" || result.status === "completed",
        "the interview should proceed normally even when memory writes fail"
      );
    } finally {
      mockMemoryProvider.write = originalWrite;
      interviewStateRepository.clear();
    }
  });

  await check("a memory retrieval failure does not break createInterview (graceful degradation)", async () => {
    const originalGetContext = mockMemoryProvider.getCandidateContext;
    mockMemoryProvider.getCandidateContext = async () => {
      throw new Error("simulated Breeth outage");
    };

    try {
      const { question, status } = await interviewOrchestrator.createInterview(CANDIDATE_A);
      assert(status === "in_progress", "interview should still start");
      assert(question && typeof question.question === "string", "a first question should still be generated");
    } finally {
      mockMemoryProvider.getCandidateContext = originalGetContext;
      interviewStateRepository.clear();
    }
  });

  await check("breethMemoryProvider fails fast and clearly when BREETH_API_KEY is missing", async () => {
    let threw = false;
    try {
      await breethMemoryProvider.write({
        candidateId: CANDIDATE_A,
        insight: { type: "strength", topic: "x", observation: "y" },
      });
    } catch (err) {
      threw = true;
      assert(err.message.includes("BREETH_API_KEY"), `expected a clear missing-credential error, got: ${err.message}`);
    }
    assert(threw, "expected breethMemoryProvider.write to throw without BREETH_API_KEY configured");
  });

  await check("memoryProvider rejects an unknown MEMORY_PROVIDER value at call time", async () => {
    const { env } = await import("../src/config/env.js");
    const original = env.memory.provider;
    env.memory.provider = "not-a-real-provider";
    let threw = false;
    try {
      await memoryProvider.write({ candidateId: CANDIDATE_A, insight: { observation: "x" } });
    } catch (err) {
      threw = true;
      assert(err.message.includes("Unknown MEMORY_PROVIDER"), `unexpected error message: ${err.message}`);
    } finally {
      env.memory.provider = original;
    }
    assert(threw, "expected an unknown provider name to throw");
  });

  mockMemoryProvider.clear();
  interviewStateRepository.clear();

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

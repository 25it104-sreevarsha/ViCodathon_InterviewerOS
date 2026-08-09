/**
 * HTTP-level integration tests for the hackathon's POST /api/interview
 * contract. Run with: npm run test:api
 *
 * Forces AI_PROVIDER=mock and MEMORY_PROVIDER=mock (regardless of any local
 * .env) so this suite is fast, free, deterministic, and never requires live
 * Anthropic/Breeth credentials — same reasoning as
 * scripts/test-intelligence-engine.js and scripts/test-memory.js. Env vars
 * are set BEFORE importing the app, so src/config/env.js picks them up.
 *
 * Uses `supertest` to drive the real Express app (src/server.js) end to
 * end over HTTP, without binding an actual port (server.js only calls
 * app.listen when run directly — see the isMainModule guard there).
 */
process.env.AI_PROVIDER = "mock";
process.env.MEMORY_PROVIDER = "mock";

const { default: request } = await import("supertest");
const { app } = await import("../src/server.js");
const { curriculumService } = await import("../src/curriculum/curriculum.service.js");
const { candidatesService } = await import("../src/candidates/candidates.service.js");
const { interviewStateRepository } = await import("../src/agent/interviewState.js");
const { sessionStore } = await import("../src/api/sessionStore.js");
const { mockMemoryProvider } = await import("../src/memory/mockMemoryProvider.js");

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

function freshSessionId(label) {
  return `test-session-${label}-${Math.random().toString(36).slice(2)}`;
}

const SAMPLE_CANDIDATE_ID = candidatesService.listCandidates()[0].id;
const SAMPLE_CANDIDATE = candidatesService.getCandidateById(SAMPLE_CANDIDATE_ID); // full record, as candidates.json shapes it

function strongAnswerFor(day) {
  const keywords = [...(day.tools ?? []), ...(day.objectives ?? [])].join(", ");
  return (
    `In depth: this involves ${keywords}. I worked through this exact scenario before — ` +
    `the key idea is understanding how ${day.title.toLowerCase()} connects the underlying tools to a working ` +
    `outcome, handling edge cases carefully and validating the result at each step along the way.`
  );
}

const WEAK_ANSWER = "I don't know, not sure about this one.";

/** Reads back the internal interview state behind a sessionId — whitebox
 * introspection for assertions the external contract doesn't expose
 * directly (e.g. "was the next question a follow-up"). */
function stateForSession(sessionId) {
  const interviewId = sessionStore.get(sessionId);
  return interviewId ? interviewStateRepository.get(interviewId) : null;
}

async function runInterviewToCompletion(sessionId) {
  let res = await request(app)
    .post("/api/interview")
    .send({ sessionId, candidate: SAMPLE_CANDIDATE });
  assert(res.status === 200, `expected 200 on start, got ${res.status}`);

  let guard = 0;
  while (res.body.done !== true && guard < 15) {
    const state = stateForSession(sessionId);
    const day = curriculumService.getDay(state.currentQuestion.curriculumDay);
    res = await request(app)
      .post("/api/interview")
      .send({ sessionId, message: strongAnswerFor(day) });
    guard += 1;
  }
  return res;
}

async function main() {
  console.log("POST /api/interview — start");

  await check("starts an interview and returns { reply, done: false }", async () => {
    const sessionId = freshSessionId("start");
    const res = await request(app)
      .post("/api/interview")
      .send({ sessionId, candidate: SAMPLE_CANDIDATE });

    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(typeof res.body.reply === "string" && res.body.reply.length > 0, "expected a non-empty reply string");
    assert(res.body.done === false, `expected done:false, got ${JSON.stringify(res.body.done)}`);
    assert(res.body.feedback === undefined, "should not include feedback before completion");
  });

  console.log("\nPOST /api/interview — continue");

  await check("same sessionId continues the interview and persists state across requests", async () => {
    const sessionId = freshSessionId("continue");
    await request(app).post("/api/interview").send({ sessionId, candidate: SAMPLE_CANDIDATE });

    const stateBefore = stateForSession(sessionId);
    assert(stateBefore.questionCount === 1, "expected question 1 to be recorded after start");

    const res = await request(app)
      .post("/api/interview")
      .send({ sessionId, message: strongAnswerFor(curriculumService.getDay(stateBefore.currentQuestion.curriculumDay)) });

    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(res.body.done === false, "interview should still be in progress after one strong answer");
    assert(typeof res.body.reply === "string" && res.body.reply.length > 0, "expected the next question as reply");

    const stateAfter = stateForSession(sessionId);
    assert(stateAfter.questionCount === 2, `expected question count to persist/advance to 2, got ${stateAfter.questionCount}`);
    assert(stateAfter.evaluations.length === 1, "expected one evaluation recorded against the persisted state");
  });

  await check("a weak answer measurably influences the next question (adaptive follow-up)", async () => {
    const sessionId = freshSessionId("adaptive");
    await request(app).post("/api/interview").send({ sessionId, candidate: SAMPLE_CANDIDATE });
    const stateBefore = stateForSession(sessionId);
    const firstDay = stateBefore.currentQuestion.curriculumDay;

    await request(app).post("/api/interview").send({ sessionId, message: WEAK_ANSWER });

    const stateAfter = stateForSession(sessionId);
    assert(
      stateAfter.currentQuestion.isFollowUp === true && stateAfter.currentQuestion.curriculumDay === firstDay,
      "expected a weak answer to produce a same-topic follow-up, exactly like the orchestrator-level test"
    );
  });

  console.log("\nPOST /api/interview — memory integration");

  await check("Breeth-style memory integration is invoked through the HTTP flow", async () => {
    const sessionId = freshSessionId("memory");
    mockMemoryProvider.clear();

    await request(app).post("/api/interview").send({ sessionId, candidate: SAMPLE_CANDIDATE });
    const stateBefore = stateForSession(sessionId);
    const day = curriculumService.getDay(stateBefore.currentQuestion.curriculumDay);
    await request(app)
      .post("/api/interview")
      .send({ sessionId, message: strongAnswerFor(day) });

    const memoryContext = await mockMemoryProvider.getCandidateContext({ candidateId: SAMPLE_CANDIDATE_ID });
    assert(
      memoryContext.insights.length > 0,
      "expected the answer -> evaluator -> insightExtractor -> memoryProvider.write chain to have written at least one insight"
    );
  });

  console.log("\nPOST /api/interview — completion");

  await check("interview eventually reaches completion via the HTTP flow", async () => {
    const sessionId = freshSessionId("completion");
    const res = await runInterviewToCompletion(sessionId);
    assert(res.body.done === true, `expected the interview to complete, last done=${res.body.done}`);
  });

  await check("final response contains exactly reply, done:true, and feedback.{summary,strengths,gaps,next}", async () => {
    const sessionId = freshSessionId("completion-shape");
    const res = await runInterviewToCompletion(sessionId);

    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(res.body.done === true, "expected done:true on the completing response");
    assert(typeof res.body.reply === "string" && res.body.reply.length > 0, "expected a non-empty reply string");

    const { feedback } = res.body;
    assert(feedback && typeof feedback === "object", "expected a feedback object");
    assert(typeof feedback.summary === "string" && feedback.summary.length > 0, "expected feedback.summary to be a non-empty string");
    assert(Array.isArray(feedback.strengths), "expected feedback.strengths to be an array");
    assert(Array.isArray(feedback.gaps), "expected feedback.gaps to be an array");
    assert(Array.isArray(feedback.next), "expected feedback.next to be an array");
    feedback.strengths.forEach((s) => assert(typeof s === "string", "every feedback.strengths entry must be a string"));
    feedback.gaps.forEach((g) => assert(typeof g === "string", "every feedback.gaps entry must be a string"));
    feedback.next.forEach((n) => assert(typeof n === "string", "every feedback.next entry must be a string"));

    const responseKeys = Object.keys(res.body).sort();
    assert(
      JSON.stringify(responseKeys) === JSON.stringify(["done", "feedback", "reply"]),
      `expected exactly reply/done/feedback at the top level, got: ${responseKeys.join(", ")}`
    );
    const feedbackKeys = Object.keys(feedback).sort();
    assert(
      JSON.stringify(feedbackKeys) === JSON.stringify(["gaps", "next", "strengths", "summary"]),
      `expected exactly summary/strengths/gaps/next in feedback, got: ${feedbackKeys.join(", ")}`
    );
  });

  console.log("\nPOST /api/interview — validation");

  await check("missing sessionId is rejected with a controlled 400, not a crash", async () => {
    const res = await request(app).post("/api/interview").send({ candidate: SAMPLE_CANDIDATE });
    assert(res.status === 400, `expected 400, got ${res.status}`);
    assert(res.body.error?.code === "VALIDATION_ERROR", `expected VALIDATION_ERROR, got ${JSON.stringify(res.body.error)}`);
  });

  await check("empty-string sessionId is rejected", async () => {
    const res = await request(app).post("/api/interview").send({ sessionId: "   ", candidate: SAMPLE_CANDIDATE });
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  await check("missing candidate on a start request is rejected", async () => {
    const res = await request(app).post("/api/interview").send({ sessionId: freshSessionId("no-candidate") });
    assert(res.status === 400, `expected 400, got ${res.status}`);
    assert(res.body.error?.code === "VALIDATION_ERROR", `expected VALIDATION_ERROR, got ${JSON.stringify(res.body.error)}`);
  });

  await check("a malformed-shape candidate (no id) is rejected", async () => {
    const res = await request(app)
      .post("/api/interview")
      .send({ sessionId: freshSessionId("bad-shape"), candidate: { name: "No Id Here" } });
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  await check("a candidate id that doesn't exist in the data layer is rejected", async () => {
    const res = await request(app)
      .post("/api/interview")
      .send({ sessionId: freshSessionId("unknown-candidate"), candidate: { id: "CAND-DOES-NOT-EXIST" } });
    assert(res.status === 404, `expected 404, got ${res.status}`);
    assert(res.body.error?.code === "NOT_FOUND", `expected NOT_FOUND, got ${JSON.stringify(res.body.error)}`);
  });

  await check("missing message on a continuation request is rejected", async () => {
    const sessionId = freshSessionId("no-message");
    await request(app).post("/api/interview").send({ sessionId, candidate: SAMPLE_CANDIDATE });
    const res = await request(app).post("/api/interview").send({ sessionId });
    assert(res.status === 400, `expected 400, got ${res.status}`);
    assert(res.body.error?.code === "VALIDATION_ERROR", `expected VALIDATION_ERROR, got ${JSON.stringify(res.body.error)}`);
  });

  await check("an empty-string message on a continuation request is rejected", async () => {
    const sessionId = freshSessionId("empty-message");
    await request(app).post("/api/interview").send({ sessionId, candidate: SAMPLE_CANDIDATE });
    const res = await request(app).post("/api/interview").send({ sessionId, message: "   " });
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  await check("an unknown sessionId sent with a message is handled safely (no crash)", async () => {
    const res = await request(app)
      .post("/api/interview")
      .send({ sessionId: freshSessionId("never-started"), message: "hello?" });
    assert(res.status === 404, `expected 404, got ${res.status}`);
    assert(res.body.error?.code === "NOT_FOUND", `expected NOT_FOUND, got ${JSON.stringify(res.body.error)}`);
  });

  await check("an unknown sessionId sent with neither candidate nor message is handled safely", async () => {
    const res = await request(app).post("/api/interview").send({ sessionId: freshSessionId("bare") });
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  await check("malformed JSON body is rejected with a controlled 400, not a raw parser error", async () => {
    const res = await request(app)
      .post("/api/interview")
      .set("Content-Type", "application/json")
      .send("{not valid json");
    assert(res.status === 400, `expected 400, got ${res.status}`);
    assert(res.body.error?.code === "VALIDATION_ERROR", `expected VALIDATION_ERROR, got ${JSON.stringify(res.body.error)}`);
    assert(!JSON.stringify(res.body).includes("SyntaxError"), "raw parser error details must not leak to the client");
  });

  await check("a non-object request body is rejected", async () => {
    const res = await request(app).post("/api/interview").send([1, 2, 3]);
    assert(res.status === 400, `expected 400, got ${res.status}`);
  });

  console.log("\nGET /health — unaffected by the new API layer");

  await check("GET /health still responds 200 and ok", async () => {
    const res = await request(app).get("/health");
    assert(res.status === 200, `expected 200, got ${res.status}`);
    assert(res.body.status === "ok", `expected status "ok", got ${JSON.stringify(res.body.status)}`);
  });

  interviewStateRepository.clear();
  sessionStore.clear();
  mockMemoryProvider.clear();

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();

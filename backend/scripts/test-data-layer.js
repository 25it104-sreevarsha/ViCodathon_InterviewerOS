/**
 * Simple smoke test for the Part 1 data layer.
 * Run with: npm test
 *
 * This talks to the service modules directly (no HTTP), so it works even
 * before the server is running, and proves the data layer works using only
 * real values from curriculum.json / candidates.json.
 */
import { curriculumService } from "../src/curriculum/curriculum.service.js";
import { candidatesService } from "../src/candidates/candidates.service.js";
import { NotFoundError } from "../src/utils/errors.js";

let failures = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  PASS  ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${label}\n        ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("Curriculum service");
check("curriculum data loads and validates", () => {
  assert(curriculumService.isAvailable(), "expected curriculum to be available");
});
check("getCohortInfo returns the cohort label", () => {
  const cohort = curriculumService.getCohortInfo();
  assert(cohort === "AI Cohort · 31 days · 8 modules", `unexpected cohort: ${cohort}`);
});
check("listDays returns all 31 days", () => {
  const days = curriculumService.listDays();
  assert(days.length === 31, `expected 31 days, got ${days.length}`);
});
check("getDay(7) returns 'Embeddings Explained'", () => {
  const day = curriculumService.getDay(7);
  assert(day.title === "Embeddings Explained", `unexpected title: ${day.title}`);
});
check("getTopic(1) matches the title", () => {
  assert(curriculumService.getTopic(1) === "VS Code & Python Environment Setup");
});
check("getObjectives(31) returns capstone objectives", () => {
  const objectives = curriculumService.getObjectives(31);
  assert(objectives.length > 0, "expected non-empty objectives for day 31");
});
check("getDays([7, 8, 22]) returns 3 days spanning multiple modules", () => {
  const days = curriculumService.getDays([7, 8, 22]);
  assert(days.length === 3, `expected 3 days, got ${days.length}`);
});
check("getModuleForDay(22) resolves to 'Agentic AI & MCP'", () => {
  const mod = curriculumService.getModuleForDay(22);
  assert(mod && mod.title === "Agentic AI & MCP", `unexpected module: ${JSON.stringify(mod)}`);
});
check("getDay(999) throws NotFoundError", () => {
  try {
    curriculumService.getDay(999);
    throw new Error("expected getDay(999) to throw");
  } catch (err) {
    assert(err instanceof NotFoundError, `expected NotFoundError, got ${err.constructor.name}`);
  }
});

console.log("\nCandidates service");
check("candidates data loads and validates", () => {
  assert(candidatesService.isAvailable(), "expected candidates to be available");
});
check("listCandidates returns all 20 candidates", () => {
  const list = candidatesService.listCandidates();
  assert(list.length === 20, `expected 20 candidates, got ${list.length}`);
});
check("getCandidateById('CAND-003') returns Emily Chen", () => {
  const candidate = candidatesService.getCandidateById("CAND-003");
  assert(candidate.member.name === "Emily Chen", `unexpected name: ${candidate.member.name}`);
});
check("getCandidateMissions('CAND-011') returns her mission list", () => {
  const missions = candidatesService.getCandidateMissions("CAND-011");
  assert(missions.length === 10, `expected 10 missions, got ${missions.length}`);
});
check("getSkippedMissions('CAND-011') finds her 5 skipped missions", () => {
  const skipped = candidatesService.getSkippedMissions("CAND-011");
  assert(skipped.length === 5, `expected 5 skipped missions, got ${skipped.length}`);
});
check("getFailedMissions('CAND-010') finds her 3 failed (not skipped) missions", () => {
  const failed = candidatesService.getFailedMissions("CAND-010");
  assert(failed.length === 3, `expected 3 failed missions, got ${failed.length}`);
});
check("getCandidateSignals('CAND-018') returns her signals object", () => {
  const signals = candidatesService.getCandidateSignals("CAND-018");
  assert(signals.missionsFirstTry === 31, `unexpected signals: ${JSON.stringify(signals)}`);
});
check("getCandidateById('CAND-999') throws NotFoundError", () => {
  try {
    candidatesService.getCandidateById("CAND-999");
    throw new Error("expected getCandidateById('CAND-999') to throw");
  } catch (err) {
    assert(err instanceof NotFoundError, `expected NotFoundError, got ${err.constructor.name}`);
  }
});

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);

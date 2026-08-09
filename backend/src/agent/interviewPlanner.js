import { curriculumService } from "../curriculum/curriculum.service.js";
import { candidatesService } from "../candidates/candidates.service.js";

const MIN_QUESTIONS = 8;
const MIN_DAYS = 4;
const TARGET_QUESTIONS = 9; // within the required 8-10 range, leaves room for one adaptive follow-up

// Maps a curriculum day's real `type` field to a question type from the
// task brief's list. Not every question type is forced onto every day —
// SETUP/LEARN days get conceptual questions, BUILD days get application
// questions, and so on, so the type actually fits the material.
const DAY_TYPE_TO_QUESTION_TYPE = {
  SETUP: "conceptual",
  LEARN: "conceptual",
  BUILD: "application",
  AI_CORE: "reasoning",
  SHIP_IT: "scenario",
  OPTIMIZE: "debugging",
  CAPSTONE: "system-design",
};

function questionTypeForDay(day) {
  return DAY_TYPE_TO_QUESTION_TYPE[day.type] || "conceptual";
}

function primarySkill(day) {
  return Array.isArray(day.tools) && day.tools.length > 0 ? day.tools[0] : day.title;
}

/**
 * Difficulty from how the candidate actually did on that mission in real
 * data: passed with few attempts -> confident -> start harder; passed with
 * many attempts -> start easier; skipped entirely -> easiest (baseline
 * awareness check, not mastery check).
 */
function difficultyForMission(mission) {
  if (mission.skipped) return "easy";
  if (typeof mission.attempts !== "number") return "medium";
  if (mission.attempts <= 1) return "hard";
  if (mission.attempts <= 3) return "medium";
  return "easy";
}

/**
 * Resolves the candidate's missions against the real curriculum, keeping
 * only missions whose day actually exists in curriculum.json (never
 * inventing days), and orders them: passed missions first (there's real
 * completed work to probe), then attempted-but-failed, then skipped last
 * (useful for a lighter gap-check question, not a deep-dive).
 */
function buildOrderedEntries(candidate) {
  const usable = (candidate.missions ?? [])
    .map((mission) => {
      let day;
      try {
        day = curriculumService.getDay(mission.day);
      } catch {
        return null; // mission references a day not in curriculum.json — skip, don't invent
      }
      return { mission, day };
    })
    .filter(Boolean);

  const passed = usable.filter((u) => u.mission.passed === true);
  const other = usable.filter((u) => u.mission.passed !== true && !u.mission.skipped);
  const skipped = usable.filter((u) => u.mission.skipped === true);

  return { ordered: [...passed, ...other, ...skipped], passed };
}

function toPlanEntry(questionNumber, { mission, day }, difficultyOverride) {
  return {
    questionNumber,
    curriculumDay: day.day,
    topic: day.title,
    skill: primarySkill(day),
    difficulty: difficultyOverride || difficultyForMission(mission),
    questionType: questionTypeForDay(day),
    moduleTitle: curriculumService.getModuleForDay(day.day)?.title ?? null,
    objectives: day.objectives ?? [],
    sourceMission: {
      passed: mission.passed ?? null,
      skipped: mission.skipped ?? false,
      attempts: mission.attempts ?? null,
      selfReported: mission.selfReported ?? false,
    },
  };
}

/**
 * REAL CANDIDATE MODE planning path — used when a candidate has no mission
 * history (candidatesService.createCandidateFromProfile always sets
 * `missions: []`). There's no "passed/failed/skipped" evidence to prioritize
 * by, so instead we ground the plan in what the candidate told us about
 * themselves: technicalSkills + targetRole, matched against real curriculum
 * days via curriculumService.searchDaysByKeywords (never inventing a day).
 *
 * Each matched day becomes a "self-reported" pseudo-mission at baseline
 * ("medium") difficulty — there's no attempt history to read confidence
 * from, so we start neutral and let the adaptive engine (real signal: how
 * they actually answer) take it from there.
 *
 * If skill-matching doesn't surface enough distinct days to hit the
 * hackathon minimums, we fill the remainder with the curriculum's own
 * foundational (SETUP/LEARN) days in order — still real curriculum, never
 * fabricated, just not skill-targeted.
 */
function buildOrderedEntriesFromProfile(candidate) {
  const member = candidate.member ?? {};
  const keywords = [...(member.technicalSkills ?? []), member.targetRole ?? member.jobRole ?? ""].filter(
    Boolean
  );

  const matched = curriculumService.searchDaysByKeywords(keywords);
  const seen = new Set();
  const ordered = [];

  for (const day of matched) {
    if (seen.has(day.day)) continue;
    seen.add(day.day);
    ordered.push({ mission: { selfReported: true, passed: null, skipped: false, attempts: null }, day });
  }

  if (ordered.length < MIN_DAYS + 1) {
    for (const day of curriculumService.getFoundationalDays()) {
      if (seen.has(day.day)) continue;
      seen.add(day.day);
      ordered.push({ mission: { selfReported: true, passed: null, skipped: false, attempts: null }, day });
    }
  }

  // Still not enough distinct real days to hit the hackathon minimums (a
  // very generic or empty skills list)? Fall back to the curriculum's own
  // day order — still 100% real curriculum.json content, never invented,
  // just no longer skill-targeted for the tail entries.
  if (ordered.length < MIN_QUESTIONS) {
    for (const { day } of curriculumService.listDays().map((d) => ({ day: curriculumService.getDay(d.day) }))) {
      if (seen.has(day.day)) continue;
      seen.add(day.day);
      ordered.push({ mission: { selfReported: true, passed: null, skipped: false, attempts: null }, day });
      if (ordered.length >= TARGET_QUESTIONS) break;
    }
  }

  return { ordered, passed: ordered };
}

/**
 * Builds a candidate-specific interview plan.
 *
 * Deliberately NOT "pick 8 random questions": pass 1 walks the candidate's
 * real, curriculum-linked missions in priority order and takes exactly one
 * distinct day per question until every available day has been covered
 * once. Pass 2 only kicks in if that didn't reach the 8-question minimum,
 * and revisits the candidate's strongest days at increased difficulty
 * rather than inventing new curriculum material.
 */
function buildInterviewPlan(candidateId) {
  const candidate = candidatesService.getCandidateById(candidateId); // throws NotFoundError if missing

  // DEMO MODE candidates (candidates.json) have real mission history to
  // ground on. REAL CANDIDATE MODE candidates (candidatesService.
  // createCandidateFromProfile) never have missions — plan from their
  // self-reported profile instead. Same downstream shape either way, so
  // nothing past this branch needs to know which path was taken.
  const { ordered, passed } =
    (candidate.missions ?? []).length > 0 ? buildOrderedEntries(candidate) : buildOrderedEntriesFromProfile(candidate);

  const uniqueDays = [...new Set(ordered.map((e) => e.day.day))];
  const insufficientCoverage = uniqueDays.length < MIN_DAYS;

  const entries = [];
  let questionNumber = 1;
  const usedDays = new Set();

  for (const entry of ordered) {
    if (usedDays.has(entry.day.day)) continue;
    entries.push(toPlanEntry(questionNumber++, entry));
    usedDays.add(entry.day.day);
  }

  if (entries.length < MIN_QUESTIONS) {
    const revisitPool = passed.length > 0 ? passed : ordered;
    for (const entry of revisitPool) {
      if (entries.length >= TARGET_QUESTIONS) break;
      entries.push(toPlanEntry(questionNumber++, entry, "hard"));
    }
  }

  return {
    candidateId,
    candidateName: candidate.member.name,
    totalPlannedQuestions: entries.length,
    plannedCurriculumDays: uniqueDays,
    insufficientCoverage,
    coverageNote: insufficientCoverage
      ? `Candidate's curriculum-linked missions only span ${uniqueDays.length} day(s), fewer than the ` +
        `${MIN_DAYS} required for full coverage. Proceeding with the material actually available rather ` +
        `than inventing additional days.`
      : null,
    entries,
  };
}

export const interviewPlanner = { buildInterviewPlan };

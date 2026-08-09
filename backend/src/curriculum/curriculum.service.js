import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DataLoadError, NotFoundError, ValidationError } from "../utils/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CURRICULUM_PATH = path.join(__dirname, "..", "data", "curriculum.json");

// Module-level cache. Why: the curriculum file is static for the whole
// hackathon run, so we read + validate it once instead of hitting disk
// on every request.
let curriculumCache = null;

/**
 * Checks that the parsed JSON actually looks like the curriculum we expect.
 * We only check the fields Part 1 relies on ("day", "title", "type", "tools",
 * "objectives") — we don't invent or require fields the file doesn't have.
 */
function validateCurriculumShape(data) {
  if (!data || typeof data !== "object") {
    throw new DataLoadError("curriculum.json did not parse to an object.");
  }
  if (!Array.isArray(data.days) || data.days.length === 0) {
    throw new DataLoadError("curriculum.json is missing a non-empty 'days' array.");
  }
  if (!Array.isArray(data.modules)) {
    throw new DataLoadError("curriculum.json is missing a 'modules' array.");
  }

  data.days.forEach((day, index) => {
    if (typeof day.day !== "number") {
      throw new DataLoadError(`curriculum.json days[${index}] is missing a numeric 'day' field.`);
    }
    if (typeof day.title !== "string" || day.title.trim() === "") {
      throw new DataLoadError(`curriculum.json day ${day.day} is missing a 'title'.`);
    }
    if (!Array.isArray(day.objectives)) {
      throw new DataLoadError(`curriculum.json day ${day.day} is missing an 'objectives' array.`);
    }
    if (!Array.isArray(day.tools)) {
      throw new DataLoadError(`curriculum.json day ${day.day} is missing a 'tools' array.`);
    }
  });

  const dayNumbers = new Set();
  for (const day of data.days) {
    if (dayNumbers.has(day.day)) {
      throw new DataLoadError(`curriculum.json has a duplicate day number: ${day.day}.`);
    }
    dayNumbers.add(day.day);
  }
}

/**
 * Loads curriculum.json from disk, parses, validates, and caches it.
 * Throws DataLoadError on a missing file or malformed JSON — callers should
 * let this bubble up to the central error handler rather than swallow it.
 */
function loadCurriculum() {
  if (curriculumCache) return curriculumCache;

  let raw;
  try {
    raw = readFileSync(CURRICULUM_PATH, "utf-8");
  } catch (err) {
    throw new DataLoadError(`Could not read curriculum.json at ${CURRICULUM_PATH}: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new DataLoadError(`curriculum.json contains invalid JSON: ${err.message}`);
  }

  validateCurriculumShape(parsed);

  curriculumCache = parsed;
  return curriculumCache;
}

/** Confirms the curriculum file loads and validates. Used by /health. */
function isAvailable() {
  try {
    loadCurriculum();
    return true;
  } catch {
    return false;
  }
}

/** Returns the cohort label, e.g. "AI Cohort · 31 days · 8 modules". */
function getCohortInfo() {
  return loadCurriculum().cohort;
}

/** Returns the list of modules (n, title, days range) as provided. */
function getModules() {
  return loadCurriculum().modules;
}

/** Returns a lightweight summary of every day: { day, title, type }. */
function listDays() {
  return loadCurriculum().days.map(({ day, title, type }) => ({ day, title, type }));
}

function findDay(dayNumber) {
  return loadCurriculum().days.find((d) => d.day === dayNumber);
}

/** Returns the full day object for a single day number. Throws if not found. */
function getDay(dayNumber) {
  if (typeof dayNumber !== "number" || !Number.isInteger(dayNumber)) {
    throw new ValidationError(`Day number must be an integer, got: ${JSON.stringify(dayNumber)}`);
  }
  const day = findDay(dayNumber);
  if (!day) {
    throw new NotFoundError(`No curriculum day found for day number ${dayNumber}.`);
  }
  return day;
}

/**
 * Returns full day objects for multiple day numbers, in the order requested.
 * Fails fast (throws) if any requested day doesn't exist, listing all of the
 * missing ones together rather than one at a time.
 */
function getDays(dayNumbers) {
  if (!Array.isArray(dayNumbers) || dayNumbers.length === 0) {
    throw new ValidationError("getDays requires a non-empty array of day numbers.");
  }
  const missing = dayNumbers.filter((n) => !findDay(n));
  if (missing.length > 0) {
    throw new NotFoundError(`No curriculum day found for day number(s): ${missing.join(", ")}.`);
  }
  return dayNumbers.map((n) => findDay(n));
}

/** Returns the title of a day. The curriculum has no separate "topic" field,
 * so the day's title is used as the topic. */
function getTopic(dayNumber) {
  return getDay(dayNumber).title;
}

/** Returns the objectives array for a day, or [] if the day has none. */
function getObjectives(dayNumber) {
  return getDay(dayNumber).objectives ?? [];
}

/** Returns the tools array for a day, or [] if the day has none. */
function getTools(dayNumber) {
  return getDay(dayNumber).tools ?? [];
}

/** Returns the module that contains a given day number, or undefined. */
function getModuleForDay(dayNumber) {
  return getModules().find(
    (mod) => Array.isArray(mod.days) && dayNumber >= mod.days[0] && dayNumber <= mod.days[1]
  );
}

function tokenize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Grounded keyword match over real curriculum days — used by
 * interviewPlanner to build a plan for a REAL-CANDIDATE-MODE candidate who
 * has no mission history yet (task brief "candidate profile" section), from
 * their self-reported technical skills / target role.
 *
 * Deliberately NOT free-text generation: every returned day is a day that
 * already exists in curriculum.json (never invents a day), scored purely by
 * token overlap between `keywords` and the day's title/tools/objectives.
 * Returns days sorted by relevance (best match first); days with zero
 * overlap are omitted.
 */
function searchDaysByKeywords(keywords, { limit = 31 } = {}) {
  const queryTokens = new Set((Array.isArray(keywords) ? keywords : [keywords]).flatMap(tokenize));
  if (queryTokens.size === 0) return [];

  const scored = loadCurriculum().days.map((day) => {
    const dayTokens = tokenize(
      [day.title, ...(day.tools ?? []), ...(day.objectives ?? [])].join(" ")
    );
    const overlap = dayTokens.filter((t) => queryTokens.has(t)).length;
    return { day, overlap };
  });

  return scored
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.day.day - b.day.day)
    .slice(0, limit)
    .map((s) => s.day);
}

/** All days marked as foundational (SETUP/LEARN) in curriculum order — used
 * as a grounded fallback baseline when a profile-based candidate's skills
 * don't match enough curriculum material to reach the interview minimums. */
function getFoundationalDays() {
  return loadCurriculum()
    .days.filter((d) => d.type === "SETUP" || d.type === "LEARN")
    .sort((a, b) => a.day - b.day);
}

export const curriculumService = {
  isAvailable,
  getCohortInfo,
  getModules,
  listDays,
  getDay,
  getDays,
  getTopic,
  getObjectives,
  getTools,
  getModuleForDay,
  searchDaysByKeywords,
  getFoundationalDays,
};

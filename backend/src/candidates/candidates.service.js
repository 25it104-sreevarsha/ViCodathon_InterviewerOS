import { readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DataLoadError, NotFoundError, ValidationError } from "../utils/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATES_PATH = path.join(__dirname, "..", "data", "candidates.json");

// Module-level cache, same reasoning as curriculum.service.js.
let candidatesCache = null;

// --- Real candidate mode -------------------------------------------------
//
// candidates.json (loaded below) is the DEMO MODE dataset: a fixed, curated
// cohort — including Emily Chen (CAND-003), which task brief explicitly
// requires we keep — each with real mission history the planner can ground
// questions in.
//
// REAL CANDIDATE MODE is for an actual person using the product: they have
// no mission history yet, so instead of reading it from disk we build a
// profile in-memory from what they tell us (name, education, branch,
// experience level, target role, technical skills, projects, optional
// resume text). This registry is intentionally separate from
// `candidatesCache` — it's runtime-only (task brief §6: no database yet),
// and IDs are prefixed "REAL-" so they can never collide with a demo
// "CAND-###" id.
const REAL_CANDIDATE_PREFIX = "REAL-";
const realCandidates = new Map(); // id -> full candidate record

function isRealCandidateId(candidateId) {
  return typeof candidateId === "string" && candidateId.startsWith(REAL_CANDIDATE_PREFIX);
}

/** "demo" | "real" — which mode a given candidate record belongs to. */
function getMode(candidateId) {
  return isRealCandidateId(candidateId) ? "real" : "demo";
}

function toStringList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[,;\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

// Rough, presentation-only mapping from a self-reported experience level
// (exactly what the frontend's ProfileStep.jsx dropdown offers) to a years
// number, so downstream prompts that already expect `yearsExperience` (a
// number) keep working unchanged for real candidates too.
const EXPERIENCE_LEVEL_YEARS = {
  "student / new grad": 0,
  "0–2 years": 1,
  "0-2 years": 1,
  "3–5 years": 4,
  "3-5 years": 4,
  "6–10 years": 8,
  "6-10 years": 8,
  "10+ years": 12,
};

function yearsFromExperienceLevel(level) {
  if (typeof level !== "string") return null;
  return EXPERIENCE_LEVEL_YEARS[level.trim().toLowerCase()] ?? null;
}

/**
 * Builds a REAL CANDIDATE MODE record from a self-reported profile (task
 * brief "CANDIDATE PROFILE" section) and registers it so getCandidateById /
 * the rest of the engine can treat it exactly like a demo candidate.
 *
 * Deliberately thin validation: only `name` and `targetRole` are required
 * (matching the frontend's own required-field set) — everything else is
 * optional and defaults to an empty value rather than failing the request,
 * since a real candidate may not have projects, certifications, or a resume
 * yet.
 *
 * `missions: []` on purpose — a real candidate has no completed-mission
 * history for the planner to read. interviewPlanner.js instead derives their
 * plan from `technicalSkills` + `targetRole` matched against real curriculum
 * days (see curriculumService.searchDaysByKeywords), never inventing days.
 */
function createCandidateFromProfile(profile) {
  if (!profile || typeof profile !== "object") {
    throw new ValidationError("A candidate profile object is required.");
  }
  const name = (profile.fullName ?? profile.name ?? "").trim();
  const targetRole = (profile.targetRole ?? profile.jobRole ?? "").trim();
  if (name === "") {
    throw new ValidationError("Candidate profile requires a non-empty 'fullName' (or 'name').");
  }
  if (targetRole === "") {
    throw new ValidationError("Candidate profile requires a non-empty 'targetRole'.");
  }

  const id = `${REAL_CANDIDATE_PREFIX}${crypto.randomUUID()}`;
  const record = {
    member: {
      id,
      name,
      jobRole: targetRole,
      targetRole,
      yearsExperience: yearsFromExperienceLevel(profile.experienceLevel) ?? profile.yearsExperience ?? 0,
      experienceLevel: profile.experienceLevel ?? null,
      education: profile.education ?? "",
      branch: profile.degree ?? profile.branch ?? "",
      technicalSkills: toStringList(profile.skills ?? profile.technicalSkills),
      projects: toStringList(profile.projects),
      certifications: toStringList(profile.certifications),
      resumeSummary: typeof profile.resumeText === "string" ? profile.resumeText.trim() : null,
      status: "IN_PROGRESS",
      mode: "real",
    },
    missions: [], // no cohort history yet — plan is built from skills/targetRole instead
    signals: null,
  };

  realCandidates.set(id, record);
  return record;
}

/**
 * Checks that the parsed JSON looks like the candidates file we expect.
 * Only validates fields Part 1 actually uses — member.id/name and a
 * missions array. We deliberately don't require every mission to have
 * "passed" or "attempts" because skipped missions legitimately omit them.
 */
function validateCandidatesShape(data) {
  if (!data || typeof data !== "object") {
    throw new DataLoadError("candidates.json did not parse to an object.");
  }
  if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
    throw new DataLoadError("candidates.json is missing a non-empty 'candidates' array.");
  }

  const seenIds = new Set();
  data.candidates.forEach((candidate, index) => {
    const member = candidate.member;
    if (!member || typeof member.id !== "string" || member.id.trim() === "") {
      throw new DataLoadError(`candidates.json candidates[${index}] is missing 'member.id'.`);
    }
    if (typeof member.name !== "string" || member.name.trim() === "") {
      throw new DataLoadError(`candidates.json candidate ${member.id} is missing 'member.name'.`);
    }
    if (!Array.isArray(candidate.missions)) {
      throw new DataLoadError(`candidates.json candidate ${member.id} is missing a 'missions' array.`);
    }
    if (seenIds.has(member.id)) {
      throw new DataLoadError(`candidates.json has a duplicate candidate id: ${member.id}.`);
    }
    seenIds.add(member.id);
  });
}

/**
 * Loads candidates.json from disk, parses, validates, and caches it.
 * Throws DataLoadError on a missing file or malformed JSON.
 */
function loadCandidates() {
  if (candidatesCache) return candidatesCache;

  let raw;
  try {
    raw = readFileSync(CANDIDATES_PATH, "utf-8");
  } catch (err) {
    throw new DataLoadError(`Could not read candidates.json at ${CANDIDATES_PATH}: ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new DataLoadError(`candidates.json contains invalid JSON: ${err.message}`);
  }

  validateCandidatesShape(parsed);

  candidatesCache = parsed;
  return candidatesCache;
}

/** Confirms the candidates file loads and validates. Used by /health. */
function isAvailable() {
  try {
    loadCandidates();
    return true;
  } catch {
    return false;
  }
}

/** Returns a lightweight summary of every candidate: { id, name, jobRole, status }. */
function listCandidates() {
  return loadCandidates().candidates.map(({ member }) => ({
    id: member.id,
    name: member.name,
    jobRole: member.jobRole,
    status: member.status,
  }));
}

function findCandidate(candidateId) {
  if (isRealCandidateId(candidateId)) {
    return realCandidates.get(candidateId);
  }
  return loadCandidates().candidates.find((c) => c.member.id === candidateId);
}

/**
 * Returns the full candidate record (member + missions + signals) for the
 * identifier actually present in the data ("CAND-001", DEMO MODE) or the
 * runtime profile registry ("REAL-...", REAL CANDIDATE MODE — see
 * createCandidateFromProfile). Throws if the candidate doesn't exist —
 * never returns fake/default candidate data.
 */
function getCandidateById(candidateId) {
  if (typeof candidateId !== "string" || candidateId.trim() === "") {
    throw new ValidationError("candidateId must be a non-empty string.");
  }
  const candidate = findCandidate(candidateId);
  if (!candidate) {
    throw new NotFoundError(`No candidate found with id '${candidateId}'.`);
  }
  return candidate;
}

/** Returns the full missions array for a candidate, in the original order. */
function getCandidateMissions(candidateId) {
  return getCandidateById(candidateId).missions;
}

/** Returns only missions the candidate passed (passed === true). */
function getCompletedMissions(candidateId) {
  return getCandidateMissions(candidateId).filter((m) => m.passed === true);
}

/** Returns only missions the candidate attempted but did not pass (passed === false). */
function getFailedMissions(candidateId) {
  return getCandidateMissions(candidateId).filter((m) => m.passed === false);
}

/** Returns only missions the candidate skipped entirely. */
function getSkippedMissions(candidateId) {
  return getCandidateMissions(candidateId).filter((m) => m.skipped === true);
}

/** Returns the candidate's aggregate learning signals (commitDays, etc), as provided. */
function getCandidateSignals(candidateId) {
  return getCandidateById(candidateId).signals ?? null;
}

/** Test/dev helper — clears runtime-registered REAL CANDIDATE MODE profiles.
 * Never touches the DEMO MODE dataset loaded from candidates.json. */
function clearRealCandidates() {
  realCandidates.clear();
}

export const candidatesService = {
  isAvailable,
  listCandidates,
  getCandidateById,
  getCandidateMissions,
  getCompletedMissions,
  getFailedMissions,
  getSkippedMissions,
  getCandidateSignals,
  getMode,
  createCandidateFromProfile,
  clearRealCandidates,
};

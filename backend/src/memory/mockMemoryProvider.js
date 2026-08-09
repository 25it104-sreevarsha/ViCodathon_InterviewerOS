import crypto from "node:crypto";

/**
 * Deterministic, in-process stand-in for Breeth.
 *
 * Same reasoning as services/ai/mockAiProvider.js: this is what runs when
 * MEMORY_PROVIDER=mock (the default), so local dev and the automated tests
 * exercise the exact same call path (memoryIntegration -> memoryProvider ->
 * write/search/getCandidateContext) as production, without any network call
 * or Breeth credential, and with fully reproducible output.
 *
 * Storage is a plain in-process Map, scoped per candidateId — analogous to
 * Breeth's per-candidate `group_id` namespace (see breethMemoryProvider.js),
 * so switching providers doesn't change the isolation semantics the rest of
 * the app relies on.
 */
const store = new Map(); // candidateId -> insight[]

function normalize(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function toResult(insight) {
  return { topic: insight.topic ?? null, observation: insight.observation, type: insight.type ?? null };
}

async function write({ candidateId, insight }) {
  if (!candidateId || typeof candidateId !== "string") {
    throw new Error("mockMemoryProvider.write requires a candidateId.");
  }
  if (!insight || typeof insight.observation !== "string" || insight.observation.trim() === "") {
    throw new Error("mockMemoryProvider.write requires an insight with a non-empty observation.");
  }

  const record = {
    id: crypto.randomUUID(),
    type: insight.type ?? "note",
    topic: insight.topic ?? null,
    observation: insight.observation.trim(),
    writtenAt: new Date().toISOString(),
  };

  const existing = store.get(candidateId) ?? [];
  existing.push(record);
  store.set(candidateId, existing);

  return { ok: true, id: record.id };
}

/**
 * Keyword-overlap search over a candidate's stored insights — a
 * deterministic stand-in for Breeth's hybrid (BM25 + vector + graph) search,
 * good enough to exercise the same "does relevant memory come back" code
 * path in tests without needing real embeddings.
 */
async function search({ candidateId, query, limit = 10 }) {
  const insights = store.get(candidateId) ?? [];
  if (!query || insights.length === 0) {
    return { results: insights.slice(-limit).map(toResult) };
  }

  const queryWords = new Set(normalize(query));
  const scored = insights.map((insight) => {
    const words = normalize(`${insight.topic ?? ""} ${insight.observation}`);
    const overlap = words.filter((w) => queryWords.has(w)).length;
    return { insight, overlap };
  });

  const matched = scored
    .filter((s) => s.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap)
    .slice(0, limit)
    .map((s) => s.insight);

  // Fall back to the most recent insights if nothing matched, so a novel
  // topic still gets *some* context rather than an empty result.
  const results = matched.length > 0 ? matched : insights.slice(-limit);
  return { results: results.map(toResult) };
}

/**
 * Higher-level convenience the adaptive/question-generation flow actually
 * calls: "what do we know about this candidate, relevant to this topic?"
 */
async function getCandidateContext({ candidateId, topic = null, limit = 5 }) {
  const insights = store.get(candidateId) ?? [];
  if (insights.length === 0) {
    return { candidateId, insights: [], summary: null };
  }

  const relevant = topic
    ? (await search({ candidateId, query: topic, limit })).results
    : insights.slice(-limit).map(toResult);

  const summary =
    relevant.length > 0
      ? relevant.map((r) => `[${r.type ?? "note"}] ${r.topic ? `${r.topic}: ` : ""}${r.observation}`).join(" | ")
      : null;

  return { candidateId, insights: relevant, summary };
}

/** Test/dev helper — clears all in-memory candidate memory. */
function clear() {
  store.clear();
}

/** Mirrors breethMemoryProvider.healthCheck — always reachable, no network. */
async function healthCheck() {
  return { reachable: true };
}

export const mockMemoryProvider = { write, search, getCandidateContext, clear, healthCheck };

import { env } from "../config/env.js";

/**
 * Real memory provider, wired to Breeth's REST API.
 *
 * Verified directly against https://docs.thebreeth.com on the date this was
 * written (REST API overview / POST /v1/episodes / POST /v1/search) — not
 * guessed. Endpoints used:
 *
 *   POST {baseUrl}/v1/episodes  — write a candidate insight as a prose
 *                                  episode. Requires a `write`-scoped key.
 *   POST {baseUrl}/v1/search    — hybrid (BM25 + vector + graph) retrieval
 *                                  over a candidate's episodes. `read` scope
 *                                  is implicit on every key.
 *
 * Isolation: every call is scoped with `group_id`, Breeth's documented
 * "sub-namespace within your project" field — one group per candidate, so
 * one candidate's interview memory can never leak into another's search
 * results (task brief §7/§9 — memory must be *this candidate's* memory).
 *
 * This is NOT active by default. The engine runs on `mockMemoryProvider`
 * until you opt in:
 *
 *   MEMORY_PROVIDER=breeth
 *   BREETH_API_KEY=ck_live_...
 *
 * What's still required from you (cannot be verified/set from code):
 *   - A Breeth account + a `write`-scoped API key from the dashboard
 *     (API Keys → New key). The plaintext key is shown exactly once.
 *   - Confirming your plan's monthly write/retrieval caps are sufficient
 *     for the hackathon demo (see https://docs.thebreeth.com/docs/tiers-and-limits).
 *
 * If BREETH_API_KEY is missing while MEMORY_PROVIDER=breeth, every call
 * below throws immediately with a clear message — callers (memoryIntegration.js)
 * are responsible for catching that and degrading gracefully rather than
 * crashing the interview.
 */

const DEFAULT_TIMEOUT_MS = 8000;

function requireApiKey() {
  if (!env.memory.breeth.apiKey) {
    throw new Error(
      "MEMORY_PROVIDER=breeth is set but BREETH_API_KEY is missing. " +
        "Set BREETH_API_KEY in .env (mint one at https://www.thebreeth.com/app -> API Keys), " +
        "or set MEMORY_PROVIDER=mock to use the deterministic mock provider instead."
    );
  }
  return env.memory.breeth.apiKey;
}

/** Breeth group_id constraint (per docs): letters, digits, dashes, underscores. */
function sanitizeGroupId(raw) {
  return String(raw).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function groupIdForCandidate(candidateId) {
  return sanitizeGroupId(`${env.memory.breeth.groupPrefix}-${candidateId}`);
}

async function breethFetch(path, body) {
  const apiKey = requireApiKey();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.memory.breeth.timeoutMs || DEFAULT_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${env.memory.breeth.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Breeth request to ${path} timed out after ${env.memory.breeth.timeoutMs}ms.`);
    }
    throw new Error(`Breeth request to ${path} failed: ${err.message}`);
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const slug = data?.error ?? "unknown_error";
    const message = data?.message ?? `HTTP ${response.status}`;
    throw new Error(`Breeth ${path} returned ${response.status} (${slug}): ${message}`);
  }
  return data;
}

/** Turns a structured insight (task brief §8 shape) into Breeth episode prose. */
function buildEpisodeContent(candidateId, insight) {
  const kind = (insight.type ?? "note").replace(/_/g, " ");
  const topicPart = insight.topic ? ` on "${insight.topic}"` : "";
  return `Interview candidate ${candidateId} — ${kind}${topicPart}: ${insight.observation}`;
}

async function write({ candidateId, insight }) {
  if (!candidateId || typeof candidateId !== "string") {
    throw new Error("breethMemoryProvider.write requires a candidateId.");
  }
  if (!insight || typeof insight.observation !== "string" || insight.observation.trim() === "") {
    throw new Error("breethMemoryProvider.write requires an insight with a non-empty observation.");
  }

  const data = await breethFetch("/v1/episodes", {
    content: buildEpisodeContent(candidateId, insight),
    group_id: groupIdForCandidate(candidateId),
    source_description: "interviewer-os",
    extract_intent: Boolean(env.memory.breeth.extractIntent),
  });

  return { ok: Boolean(data?.ok), id: data?.episode_name ?? null };
}

function edgeToResult(edge) {
  return {
    topic: edge.source_node ?? null,
    observation: edge.fact ?? "",
    type: edge.intent_meta?.edge_kind ?? null,
  };
}

async function search({ candidateId, query, limit = 10 }) {
  if (!candidateId || typeof candidateId !== "string") {
    throw new Error("breethMemoryProvider.search requires a candidateId.");
  }
  if (!query || typeof query !== "string") {
    throw new Error("breethMemoryProvider.search requires a non-empty query.");
  }

  const data = await breethFetch("/v1/search", {
    query,
    group_id: groupIdForCandidate(candidateId),
    limit,
  });

  const edges = Array.isArray(data?.edges) ? data.edges : [];
  return { results: edges.map(edgeToResult) };
}

async function getCandidateContext({ candidateId, topic = null, limit = 5 }) {
  const query = topic
    ? `What has the candidate demonstrated about "${topic}"?`
    : "What are this candidate's strengths, knowledge gaps, and misconceptions so far?";

  const { results } = await search({ candidateId, query, limit });
  const summary =
    results.length > 0
      ? results.map((r) => `[${r.type ?? "fact"}] ${r.observation}`).join(" | ")
      : null;

  return { candidateId, insights: results, summary };
}

/**
 * Cheap reachability probe for GET /health/memory (see api/health.routes.js).
 * Issues one minimal /v1/search call scoped to a reserved, non-candidate
 * group so it never touches or leaks real candidate data — but it still
 * counts against the monthly retrievals counter (unlimited on Pro, capped
 * on Hobby/Starter/Growth per docs/tiers-and-limits), so callers should
 * cache the result rather than hitting this on every poll.
 * Never throws: resolves to { reachable: boolean, error?: string }.
 */
async function healthCheck() {
  if (!env.memory.breeth.apiKey) {
    return { reachable: false, error: "BREETH_API_KEY is not configured." };
  }
  try {
    await breethFetch("/v1/search", {
      query: "healthcheck",
      group_id: sanitizeGroupId(`${env.memory.breeth.groupPrefix}-healthcheck`),
      limit: 1,
    });
    return { reachable: true };
  } catch (err) {
    // Safe, generic message only — never surface response bodies/headers
    // here, so a stray credential-adjacent detail can't leak through a
    // diagnostics endpoint.
    return { reachable: false, error: "Breeth request failed." };
  }
}

export const breethMemoryProvider = { write, search, getCandidateContext, healthCheck };

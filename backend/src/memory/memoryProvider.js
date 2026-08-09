import { env } from "../config/env.js";
import { mockMemoryProvider } from "./mockMemoryProvider.js";
import { breethMemoryProvider } from "./breethMemoryProvider.js";

/**
 * Memory provider abstraction.
 *
 * Mirrors services/ai/aiProvider.js on purpose: this is the ONLY module in
 * the codebase that knows which concrete memory backend is in use. Nothing
 * in agent/ talks to Breeth's REST API (or the mock's in-memory Map)
 * directly — everything goes through `memoryProvider.write` /
 * `memoryProvider.search` / `memoryProvider.getCandidateContext`.
 *
 * Every provider must implement:
 *   write({ candidateId, insight })              => Promise<{ ok: boolean, id?: string }>
 *   search({ candidateId, query, limit })         => Promise<{ results: MemoryResult[] }>
 *   getCandidateContext({ candidateId, topic })   => Promise<CandidateContext>
 *   healthCheck()                                 => Promise<{ reachable: boolean, error?: string }>
 *
 * `insight` shape (task brief §8 — strength / knowledge_gap / misconception):
 *   { type: "strength" | "knowledge_gap" | "misconception", topic: string, observation: string }
 *
 * `MemoryResult` shape (provider-normalized, not the raw Breeth edge):
 *   { topic: string | null, observation: string, type: string | null }
 *
 * `CandidateContext` shape — what the question generator actually receives:
 *   { candidateId, insights: MemoryResult[], summary: string | null }
 *
 * MEMORY_PROVIDER=mock (default, no credentials needed) or
 * MEMORY_PROVIDER=breeth (real Breeth REST API — see breethMemoryProvider.js
 * and README "Breeth configuration"). Tests always run against the mock so
 * they stay deterministic, fast, and free (task brief §18) — never set
 * MEMORY_PROVIDER=breeth in the test env.
 */
function resolveProvider() {
  switch (env.memory.provider) {
    case "breeth":
      return breethMemoryProvider;
    case "mock":
      return mockMemoryProvider;
    default:
      throw new Error(`Unknown MEMORY_PROVIDER "${env.memory.provider}". Expected "mock" or "breeth".`);
  }
}

export const memoryProvider = {
  write(request) {
    return resolveProvider().write(request);
  },
  search(request) {
    return resolveProvider().search(request);
  },
  getCandidateContext(request) {
    return resolveProvider().getCandidateContext(request);
  },
  healthCheck() {
    return resolveProvider().healthCheck();
  },
  name() {
    return env.memory.provider;
  },
};

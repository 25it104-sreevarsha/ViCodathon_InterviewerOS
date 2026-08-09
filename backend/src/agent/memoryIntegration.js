import { memoryProvider } from "../memory/memoryProvider.js";
import { extractInsights } from "./insightExtractor.js";

/**
 * The only place interviewOrchestrator.js touches memory. Keeping this in
 * its own module (rather than inline in the orchestrator) is what task
 * brief §11 means by "the orchestrator must remain modular" — this file
 * owns exactly one job: turn an evaluation into memory writes, and turn a
 * candidateId into memory context, without ever letting a memory-layer
 * failure take down the interview (task brief §15/§17 — "memory provider
 * failure handling", "graceful fallback behavior").
 */

/**
 * Extracts insights from the latest evaluation and writes each to memory.
 * Never throws — a Breeth outage should degrade the demo, not crash it.
 * Returns a small diagnostic summary the orchestrator can optionally log.
 */
export async function recordCandidateInsights(candidateId, evaluation, question) {
  const insights = extractInsights(evaluation, question);
  if (insights.length === 0) {
    return { attempted: 0, written: 0, failed: 0 };
  }

  const results = await Promise.allSettled(insights.map((insight) => memoryProvider.write({ candidateId, insight })));

  const written = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - written;

  if (failed > 0) {
    for (const r of results) {
      if (r.status === "rejected") {
        console.warn(`[memory] failed to write insight for ${candidateId}: ${r.reason?.message ?? r.reason}`);
      }
    }
  }

  return { attempted: insights.length, written, failed };
}

/**
 * Retrieves what memory knows about a candidate, relevant to `topic`, for
 * the question generator to fold into its prompt via `memoryContext`.
 * `externalMemoryContext` is the pre-existing optional pass-through param
 * the orchestrator already accepted (task brief's Part 2 code, unused until
 * now) — kept alongside rather than overwritten, so a future caller who
 * supplies their own context isn't silently ignored.
 *
 * Never throws: on any memory-layer failure this returns an "unavailable"
 * context (empty insights) rather than blocking question generation.
 */
export async function retrieveMemoryContext(candidateId, topic, externalMemoryContext = null) {
  let context;
  try {
    context = await memoryProvider.getCandidateContext({ candidateId, topic });
  } catch (err) {
    console.warn(`[memory] failed to retrieve context for ${candidateId}: ${err.message}`);
    context = { candidateId, insights: [], summary: null, unavailable: true };
  }

  if (!externalMemoryContext || Object.keys(externalMemoryContext).length === 0) {
    return context;
  }

  return { ...context, external: externalMemoryContext };
}

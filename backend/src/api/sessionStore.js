/**
 * Maps the hackathon API's external `sessionId` to the internal
 * `interviewId` that `interviewOrchestrator` / `interviewStateRepository`
 * already use as their key.
 *
 * Why a separate map instead of reusing sessionId as the interviewId
 * directly: interviewState.js (untouched, per instructions) generates its
 * own `interviewId` via `crypto.randomUUID()` inside `createInterviewState`.
 * Rather than changing that, this thin layer just remembers which
 * interviewId belongs to which sessionId.
 *
 * In-memory only, deliberately — same hackathon-scope tradeoff as
 * interviewStateRepository (src/agent/interviewState.js). A server restart
 * loses the session -> interview mapping (and the interview state itself,
 * since that's also in-memory), so an in-flight interview cannot be resumed
 * across a restart. See README "Known limitations".
 */
const sessionToInterviewId = new Map();

export const sessionStore = {
  get(sessionId) {
    return sessionToInterviewId.get(sessionId) ?? null;
  },
  set(sessionId, interviewId) {
    sessionToInterviewId.set(sessionId, interviewId);
  },
  has(sessionId) {
    return sessionToInterviewId.has(sessionId);
  },
  delete(sessionId) {
    sessionToInterviewId.delete(sessionId);
  },
  /** Test/dev helper — clears all in-memory session mappings. */
  clear() {
    sessionToInterviewId.clear();
  },
};

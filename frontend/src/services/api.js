// API abstraction for talking to the Interviewer OS backend.
//
// The backend exposes a single conversational endpoint:
//
//   POST /api/interview
//
// The same call shape is reused for both starting an interview (send
// `candidate`) and continuing one (send `message`); the backend tells them
// apart based on whether it already has a session for `sessionId`. See
// backend/src/api/interview.routes.js for the authoritative contract.

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

/**
 * Extracts a user-friendly error message from a failed response, matching
 * the backend's `{ error: { code, message } }` shape (middleware/errorHandler.js)
 * without leaking stack traces or internals if the shape is ever different.
 */
async function readErrorMessage(response, fallback) {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || fallback;
  } catch {
    return fallback;
  }
}

async function postToInterviewEndpoint(body, fallbackErrorMessage) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/interview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (networkError) {
    // fetch() itself threw: backend unreachable, DNS failure, CORS block, etc.
    throw new Error(
      "Couldn't reach the interview server. Check that the backend is running and try again.",
      { cause: networkError }
    );
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, fallbackErrorMessage));
  }

  return response.json();
}

/**
 * Starts a brand-new interview for `sessionId`.
 * `candidate` must be an object with at least an `id` matching a known
 * backend candidate record, e.g. `{ id: "CAND-003" }`.
 */
export async function startInterview(sessionId, candidate) {
  return postToInterviewEndpoint(
    { sessionId, candidate },
    "Failed to start the interview."
  );
}

/**
 * Continues an in-progress interview: submits the candidate's answer to the
 * current question and returns the backend's next reply (or final feedback
 * once `done: true`).
 */
export async function sendAnswer(sessionId, message) {
  return postToInterviewEndpoint(
    { sessionId, message },
    "Failed to submit your answer."
  );
}

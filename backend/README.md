# Interviewer OS — Backend

Backend for **Interviewer OS**, built for the **ABTalks Vibe Code Hackathon 2026**
(Problem Statement 2 — The Interview Agent).

This repository now implements the full backend for the hackathon:

- **Part 1** — data layer foundation (`curriculum.service.js`, `candidates.service.js`)
- **Part 2** — the AI Interview Intelligence Engine (planner, question
  generator, answer evaluator, adaptive engine, orchestrator, in-memory
  interview state)
- **Part 3** — Breeth-backed candidate long-term memory
- **Part 4** — the official hackathon HTTP contract, `POST /api/interview`,
  plus CORS, request validation, and HTTP-level tests

This document covers the backend only. For the full product (including the
frontend interview experience) see the [root README](../README.md).

Still not implemented in the backend itself: authentication, a database,
an MCP server.

## Architecture

```
backend/
├── src/
│   ├── config/env.js               # loads .env, exposes PORT/CORS/AI/memory config
│   ├── data/                       # the provided hackathon data, untouched
│   │   ├── curriculum.json
│   │   └── candidates.json
│   ├── curriculum/curriculum.service.js
│   ├── candidates/candidates.service.js
│   ├── utils/
│   │   ├── errors.js                # AppError, NotFoundError, ValidationError, DataLoadError
│   │   ├── jsonExtract.js           # defensive JSON extraction from raw AI text
│   │   └── asyncHandler.js          # forwards async route rejections to Express's error middleware
│   ├── middleware/errorHandler.js  # converts thrown errors (incl. malformed-JSON bodies) into JSON responses
│   ├── api/                        # ---- Part 4: the hackathon HTTP contract ----
│   │   ├── health.routes.js         # GET /health, GET /health/memory (Breeth diagnostics)
│   │   ├── interview.routes.js      # POST /api/interview — thin HTTP layer over interviewOrchestrator
│   │   ├── sessionStore.js          # maps external sessionId -> internal interviewId
│   │   └── feedbackMapper.js        # adapts finalEvaluation.js's output into the contract's `feedback` shape
│   ├── agent/                      # ---- Part 2: the intelligence engine ----
│   │   ├── interviewState.js        # state shape + mutation helpers + in-memory repository
│   │   ├── interviewPlanner.js      # candidate-specific multi-day interview plan
│   │   ├── questionGenerator.js     # grounded, deduped question generation
│   │   ├── answerEvaluator.js       # structured, schema-validated answer scoring
│   │   ├── adaptiveEngine.js        # the core adaptive "what's next" decision logic
│   │   ├── finalEvaluation.js       # aggregates a completed interview into a summary
│   │   ├── interviewOrchestrator.js # wires the above into createInterview/submitAnswer/...
│   │   ├── insightExtractor.js      # (Part 3) evaluation -> strength/gap/misconception insights
│   │   ├── memoryIntegration.js     # (Part 3) orchestrator <-> memory, with failure isolation
│   │   └── index.js                 # barrel export — the surface interview.routes.js uses
│   ├── services/ai/                # AI provider abstraction (Part 2)
│   │   ├── aiProvider.js            # dispatcher other code calls — never call a provider directly
│   │   ├── mockAiProvider.js        # deterministic, no-network provider (default)
│   │   └── anthropicAiProvider.js   # real Anthropic Messages API integration (opt-in)
│   ├── memory/                     # ---- Part 3: Breeth-backed candidate memory ----
│   │   ├── memoryProvider.js        # dispatcher — mirrors services/ai/aiProvider.js
│   │   ├── mockMemoryProvider.js    # deterministic, no-network provider (default, used by tests)
│   │   └── breethMemoryProvider.js  # real Breeth REST API integration (opt-in)
│   ├── prompts/                    # dedicated prompt modules (Part 2)
│   │   ├── question.prompt.js
│   │   ├── followup.prompt.js
│   │   └── evaluation.prompt.js
│   ├── schemas/evaluation.schema.js # validates/sanitizes raw AI evaluator output
│   └── server.js                   # Express app: CORS, /health, /api/interview, error handling
├── scripts/
│   ├── test-data-layer.js           # Part 1 smoke test
│   ├── test-intelligence-engine.js  # Part 2 tests (planner/generator/evaluator/adaptive/e2e)
│   ├── test-memory.js               # Part 3 tests (memory provider/insights/adaptive-memory/e2e/failures)
│   ├── test-breeth-provider.js      # Part 3 tests (breethMemoryProvider vs a stubbed fetch: auth, isolation, 401/429)
│   ├── test-json-extract.js         # regression test for jsonExtract's brace-matching hardening
│   └── test-http-api.js             # Part 4 tests — HTTP-level integration tests via supertest
├── .env.example
└── package.json
```

**Design principle preserved throughout Part 4:** the HTTP layer (`src/api/`)
does not reimplement any interview logic. `interview.routes.js` validates
the request, resolves `sessionId` -> `interviewId`, and calls straight into
`interviewOrchestrator.createInterview` / `.submitAnswer` — the exact same
planner/generator/evaluator/adaptive-engine/memory flow audited and tested
in Parts 2–3, completely untouched.

## Install & run

```bash
cd backend
npm install
cp .env.example .env
npm start
```

You should see:

```
Interviewer OS backend listening on http://localhost:3000
Environment: development
```

For auto-restart on file changes during development:

```bash
npm run dev
```

## The `POST /api/interview` contract

This is the **only** endpoint the hackathon Technical Specification
requires (besides `GET /health`). No authentication is required. The same
request shape is used to both start and continue an interview — which mode
applies is inferred from the request body and the `sessionId`'s known state.

### Start an interview

Send `sessionId` (any string you choose, e.g. a UUID) plus `candidate` (a
candidate record shaped like an entry from `candidates.json` — either
`{ "id": "CAND-001", ... }` or the full `{ "member": { "id": "CAND-001", ... }, "missions": [...] }` shape both work; only the id is used to look up
the canonical record via the existing `candidatesService`):

```json
POST /api/interview
{
  "sessionId": "abc-123",
  "candidate": { "id": "CAND-001" }
}
```

```json
200 OK
{
  "reply": "Welcome, Sarah Johnson! Let's begin your interview.\n\n<first question text>",
  "done": false
}
```

### Continue an interview

Send the same `sessionId` plus `message` (the candidate's answer to the
current question):

```json
POST /api/interview
{
  "sessionId": "abc-123",
  "message": "The candidate's answer text..."
}
```

```json
200 OK
{
  "reply": "<next question text>",
  "done": false
}
```

Internally this runs the existing flow, untouched:
answer → `answerEvaluator` → `insightExtractor` → `memoryProvider.write`
(Breeth or mock) → `memoryProvider.getCandidateContext` for the next topic →
`adaptiveEngine.decideNext` → `questionGenerator`.

### Completion

Once the orchestrator's adaptive engine determines the interview is done
(plan exhausted or the 10-question cap is hit):

```json
200 OK
{
  "reply": "Interview completed.",
  "done": true,
  "feedback": {
    "summary": "Completed 9 question(s) across 6 curriculum day(s) with an average score of 7.8/10.",
    "strengths": ["..."],
    "gaps": ["..."],
    "next": ["Review and practice: ..."]
  }
}
```

`feedback` is produced by `src/api/feedbackMapper.js`, which adapts the
existing `finalEvaluation.js` output (averages, `meetsHackathonMinimums`,
etc. — untouched) into exactly the four fields the contract requires:
`summary` (string), `strengths` (string[]), `gaps` (string[]), `next`
(string[]).

### Error responses

All errors use the existing central error handler's shape:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

| Situation | Status | Code |
|---|---|---|
| Missing/empty `sessionId` | 400 | `VALIDATION_ERROR` |
| Missing/malformed `candidate` on a start request | 400 | `VALIDATION_ERROR` |
| `candidate` id not found in `candidates.json` | 404 | `NOT_FOUND` |
| Missing/empty `message` on a continuation request | 400 | `VALIDATION_ERROR` |
| `sessionId` not known to the server (never started, or lost across a restart) | 404 | `NOT_FOUND` |
| Malformed JSON request body | 400 | `VALIDATION_ERROR` |
| Non-object request body | 400 | `VALIDATION_ERROR` |
| Unexpected/internal failure | 500 | `INTERNAL_ERROR` (no stack trace, key, or internal detail is ever included in the response body — see `middleware/errorHandler.js`) |

## Session management

`sessionId` (from the request body) is the external key the frontend uses.
Internally, `src/api/sessionStore.js` maps each `sessionId` to the
`interviewId` that `interviewOrchestrator`/`interviewStateRepository`
already generate and key on (unchanged from Part 2) — this keeps the
existing state management code completely untouched while satisfying the
contract's external `sessionId` key.

**Known limitation:** both `sessionStore` and `interviewStateRepository`
are in-memory only (a hackathon-scope tradeoff carried over unchanged from
Part 2/3). **A server restart loses all active sessions and their
interview state.** A request against a `sessionId` from before a restart
returns a clean `404 NOT_FOUND` (see table above) rather than crashing —
the frontend would need to start a new interview in that case. No database
was added for this task, per the instructions.

## CORS

`server.js` applies `cors()` using `CORS_ORIGIN` from the environment:
`*` (default) allows any origin; set a specific origin, or a
comma-separated list, in `.env` for production:

```bash
CORS_ORIGIN=https://your-frontend.example.com
# or
CORS_ORIGIN=http://localhost:5173,https://your-frontend.example.com
```

No additional authentication is added — the spec explicitly requires none.

## Environment variables

See `.env.example` for the authoritative, commented list. Summary:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port the server listens on |
| `NODE_ENV` | `development` | Standard Node environment flag |
| `CORS_ORIGIN` | `*` | Allowed origin(s) for the frontend; comma-separated for multiple |
| `AI_PROVIDER` | `mock` | `mock` (deterministic, no key) or `anthropic` (real model calls) |
| `AI_API_KEY` | *(unset)* | Required only when `AI_PROVIDER=anthropic` |
| `AI_MODEL` | `claude-sonnet-4-6` | Optional, only used when `AI_PROVIDER=anthropic` |
| `MEMORY_PROVIDER` | `mock` | `mock` (deterministic, no key) or `breeth` (real Breeth REST API) |
| `BREETH_API_KEY` | *(unset)* | Required only when `MEMORY_PROVIDER=breeth` |
| `BREETH_BASE_URL` | `https://api.thebreeth.com` | Breeth API base URL |
| `BREETH_GROUP_PREFIX` | `interviewer-os` | Prefixes every Breeth `group_id` |
| `BREETH_EXTRACT_INTENT` | `false` | Whether Breeth writes run intent annotation |
| `BREETH_TIMEOUT_MS` | `8000` | Per-request Breeth timeout |

**Never commit a real `.env` file or real credentials.** `.env.example`
contains placeholders only.

## Test commands

```bash
npm test          # Part 1 — data layer smoke test
npm run test:engine  # Part 2 — planner/generator/evaluator/adaptive engine/orchestrator
npm run test:memory  # Part 3 — Breeth-abstraction memory integration (via mockMemoryProvider)
npm run test:breeth  # Part 3 — breethMemoryProvider itself, against a stubbed fetch
npm run test:json    # jsonExtract brace-matching regression test
npm run test:api     # Part 4 — HTTP-level integration tests against POST /api/interview
npm run test:all     # all of the above, in order
```

All test suites — including `test:api` and `test:breeth` — run against
deterministic providers regardless of your local `.env`, so nothing here
ever requires a live Anthropic or Breeth credential, and every run is fast,
free, and reproducible. `test:memory` exercises the memory *abstraction*
end-to-end through `mockMemoryProvider`; `test:breeth` separately exercises
`breethMemoryProvider.js`'s actual Breeth request/response handling —
auth header, `group_id` isolation, `/v1/episodes` and `/v1/search` payload
shapes, and the documented 401/429 error envelopes — against a stubbed
`fetch`, so the real integration code is covered without a live key.

`test:api` uses [`supertest`](https://github.com/ladjs/supertest) to drive
the real Express app in-process (no port is actually bound — `server.js`
only calls `app.listen` when run directly via `node src/server.js`, guarded
by an `isMainModule` check; importing the app, as the test does, does not
start a listener).

It covers: starting an interview over HTTP, continuing the same session,
that answers concretely change the next question (adaptive follow-up),
that a memory insight is actually written and retrievable through the full
HTTP round trip, reaching completion, the exact final response shape
(`reply` / `done` / `feedback.{summary,strengths,gaps,next}`), and every
validation case in the table above (missing/empty `sessionId`, missing or
invalid `candidate`, missing `message`, unknown `sessionId`, malformed
JSON, non-object body) — plus a check that `GET /health` still works
unaffected.

## How the frontend connects

1. Start the backend (`npm start`), noting `PORT` and `CORS_ORIGIN`.
2. From the frontend, `POST` JSON to `http://<host>:<port>/api/interview`
   with a `sessionId` you generate client-side (e.g. `crypto.randomUUID()`)
   and either `candidate` (first call) or `message` (every call after).
3. Keep sending the same `sessionId` on every subsequent call for that
   candidate's interview; stop when the response has `done: true` and
   render `feedback`.
4. No auth header or cookie is required.

## Example curl requests

```bash
# Start
curl -s -X POST http://localhost:3000/api/interview \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"demo-1","candidate":{"id":"CAND-001"}}'

# Continue (repeat with the candidate's next answer each time)
curl -s -X POST http://localhost:3000/api/interview \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"demo-1","message":"My answer to that question..."}'

# Health check
curl -s http://localhost:3000/health
```

## AI provider

The engine talks to AI through one abstraction (`src/services/ai/aiProvider.js`)
so nothing else in the codebase depends on a specific model or SDK.

```bash
# .env — default, no key needed:
AI_PROVIDER=mock

# .env — real model calls:
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-6   # optional, this is already the default
```

- **`mock` (default):** deterministic, keyword-overlap-based question/answer
  logic. No network call, no API key. This is what every automated test in
  this repo runs against, including the new `npm run test:api`.
- **`anthropic`:** real calls to the Anthropic Messages API
  (`src/services/ai/anthropicAiProvider.js`). Enable it by setting
  `AI_PROVIDER=anthropic` and `AI_API_KEY` in `.env`. No code changes
  needed. A missing API key fails fast with a clear error (not a silent
  fallback) rather than crashing the process — it surfaces through the
  central error handler as a controlled `500 INTERNAL_ERROR` on whichever
  request triggered it.

## Memory provider (Breeth)

The engine talks to candidate memory through one abstraction
(`src/memory/memoryProvider.js`), mirroring how `aiProvider.js` abstracts the
AI backend:

```bash
# .env — default, no key needed:
MEMORY_PROVIDER=mock

# .env — real, persistent candidate memory via Breeth:
MEMORY_PROVIDER=breeth
BREETH_API_KEY=ck_live_...
```

- **`mock` (default):** an in-process `Map`, scoped per candidate, with a
  deterministic keyword-overlap search. No network call, no credential.
  This is what every automated test always runs against (including through
  the new HTTP layer in `test:api`), which is what makes the suite
  reproducible.
- **`breeth`:** real calls to [Breeth's REST API](https://docs.thebreeth.com)
  (`src/memory/breethMemoryProvider.js`) —
  `POST https://api.thebreeth.com/v1/episodes` to write an insight,
  `POST https://api.thebreeth.com/v1/search` to retrieve relevant ones.
  **Requires a Breeth account and a `write`-scoped API key** (dashboard →
  API Keys → New key) — that key is the one piece that can't be obtained or
  verified from this environment. Enable it with `MEMORY_PROVIDER=breeth`
  and `BREETH_API_KEY` in `.env`; no code changes needed.

**Breeth integration status: implemented and unit-tested against a stubbed
API, not yet exercised against the live API.** `breethMemoryProvider.js`
targets Breeth's documented REST endpoints and request/response shapes
exactly as listed above, and `npm run test:breeth` covers its actual
request-building and response-parsing logic (auth header, episode content,
`group_id` per candidate, edge-to-insight mapping, and the documented
401/429 error envelopes) against a stubbed `fetch` — but this sandbox has
no network egress to `api.thebreeth.com`, so none of that has run against
the real service, and the main automated suite deliberately forces
`MEMORY_PROVIDER=mock` so nothing here silently depends on a live
credential. Before a real demo: set `MEMORY_PROVIDER=breeth` and a real
`BREETH_API_KEY` in `.env`, start the server, and check `GET
/health/memory` returns `{"status":"ok"}`; that alone confirms
connectivity and auth without needing a full interview run.

Each candidate's memory lives in its own Breeth `group_id`
(`interviewer-os-<candidateId>` by default, configurable via
`BREETH_GROUP_PREFIX`), so one candidate's interview memory can never leak
into another's — Breeth's documented tenancy boundary is per `group_id`
within your project.

**Diagnostics:** `GET /health/memory` reports which provider is active and
whether it's usable — `{ provider, status }` where `status` is `ok`,
`not_configured` (breeth selected but `BREETH_API_KEY` unset), or
`unreachable`. It never returns the API key or raw upstream error detail.
For `MEMORY_PROVIDER=mock` this is instant and free. For `breeth` it makes
one lightweight Breeth call and caches the result for 30s so repeated polling
doesn't spend retrieval quota; it's a manual/ops diagnostic, not something
the frontend depends on or calls.

**Failure handling:** every memory call from the orchestrator goes through
`memoryIntegration.js` (unchanged), which never lets a memory-layer error
propagate — a write failure is logged and skipped; a retrieval failure
returns an empty context. A Breeth outage degrades the "smarter follow-up"
behavior; it does not crash an interview in progress, and it does not
surface as a 500 from `POST /api/interview` either — the HTTP layer never
even sees it. See `npm run test:memory`'s "Failure handling" section and
`npm run test:api`'s memory-integration check for the tests proving this.

## JSON parsing hardening

`src/utils/jsonExtract.js` (used by `questionGenerator` and
`answerEvaluator` to pull a JSON object out of raw AI text) previously
matched greedily from the first `{` to the **last** `}` in the whole
response. That over-captures if the model appends trailing prose containing
its own braces after the JSON object, producing an unparsable blob. It now
scans for the first **balanced** `{...}` object (tracking brace depth and
skipping braces inside string literals) instead — same result for the
common well-formed case, safer for realistic trailing commentary. See
`scripts/test-json-extract.js` / `npm run test:json` for the regression
tests, including the exact failure mode this fixes.

## Anthropic / Breeth failure handling

Both `anthropicAiProvider.js` and `breethMemoryProvider.js` throw plain
`Error`s on network failure, timeout, or a non-2xx response — they never
crash the process. On the AI side, `questionGenerator`/`answerEvaluator`
let that propagate up through `interviewOrchestrator` to
`interview.routes.js`'s `asyncHandler`, which forwards it to the existing
central `errorHandler` middleware — the client gets a controlled
`500 INTERNAL_ERROR` with no stack trace or internal detail, never an
unhandled crash. On the memory side, `memoryIntegration.js`'s existing
isolation (Part 3, unchanged) already prevents any Breeth failure from
reaching the HTTP layer at all.

## Example usage of the interview engine (programmatic, not HTTP)

```js
import { interviewOrchestrator } from "./src/agent/index.js";

const { interviewId, question, plan } = await interviewOrchestrator.createInterview("CAND-003");
console.log(plan.totalPlannedQuestions, plan.plannedCurriculumDays);
console.log(question.question); // question 1, grounded in the candidate's actual mission history

const result = await interviewOrchestrator.submitAnswer(interviewId, "Emily's answer text...");
// result.evaluation      -> structured score/gaps/strengths for that answer
// result.question        -> the next question (adaptively chosen), or null if done
// result.status           -> "in_progress" | "completed"
// result.finalEvaluation -> populated once status is "completed"
```

`interview.routes.js` is a thin wrapper around exactly this same call
pattern — nothing about the underlying engine changed to expose it over
HTTP.

## How the planner, evaluator, and adaptive engine interact

1. **`interviewPlanner`** looks at what the candidate actually did (passed,
   failed, or skipped missions, mapped to real curriculum days) and builds an
   ordered plan of >= 8 questions across >= 4 distinct days, with a
   difficulty and question type derived from that history — not random
   picks.
2. **`interviewOrchestrator.createInterview`** creates interview state and
   asks **`questionGenerator`** to turn plan entry #1 into an actual question
   grounded in that day's real objectives/tools.
3. On **`submitAnswer`**, **`answerEvaluator`** scores the candidate's answer
   into the structured schema (score, correctness, depth, reasoning,
   clarity, missing concepts, misconceptions, strengths, gaps).
4. **`adaptiveEngine.decideNext`** is the only thing that decides what
   happens next, based purely on that evaluation:
   - strong (>= 8) → advance to the next planned day, difficulty bumped up
   - weak (< 4) or a flagged partial answer → stay on the same topic with a
     targeted follow-up (max one per topic, so it can't spiral), difficulty
     adjusted down
   - otherwise → advance to the next planned day at its planned difficulty
5. `questionGenerator` turns whatever the adaptive engine chose into the next
   actual question (deduped against everything already asked), and the loop
   repeats until the plan is exhausted or a 10-question cap is hit, at which
   point `finalEvaluation` aggregates the whole interview.

This is what makes "the answer influences the next question" concretely
true rather than aspirational: step 4 has no fallback path that ignores the
evaluation. `interview.routes.js` sits entirely downstream of this — it
never bypasses or duplicates any of it.

## Deployment

This is a single stateless-except-for-in-memory-sessions Node/Express
process; any standard Node hosting works (a VM, a container, a PaaS like
Render/Fly/Railway/Heroku-style platforms).

1. Set the environment variables from the table above on the host (at
   minimum `PORT`; set `CORS_ORIGIN` to your real frontend origin;
   set `AI_PROVIDER`/`AI_API_KEY` and `MEMORY_PROVIDER`/`BREETH_API_KEY` if
   you want real model calls and real Breeth memory rather than the mocks).
2. `npm install --omit=dev` (or plain `npm install`).
3. `npm start` (runs `node src/server.js`, which binds `PORT` and logs
   readiness).
4. Point the frontend at `https://<your-host>/api/interview` and
   `https://<your-host>/health`.

**Known limitation, worth repeating for deployment:** interview state
(`interviewStateRepository`) and the `sessionId` mapping (`sessionStore`)
are both in-memory `Map`s. If the process restarts (a redeploy, a crash, a
platform-initiated recycle) **every in-progress interview is lost** — the
next request against that `sessionId` gets a clean `404 NOT_FOUND`, not
corrupted or stale data, but the candidate would need to start over. If you
need interviews to survive restarts/redeploys, that requires adding
persistent storage behind `interviewStateRepository`/`sessionStore` — both
are already isolated behind small, swappable interfaces for exactly this
reason, but no database was added for this task per the instructions.

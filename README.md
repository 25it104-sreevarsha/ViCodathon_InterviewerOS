# Interviewer OS

An AI technical interviewer that adapts its questions to *your* actual
learning journey — not a fixed question bank.

## Problem

Technical interview preparation is difficult because generic interviewers
don't understand a candidate's actual learning journey. A candidate who
just spent two weeks on RAG systems and vector databases gets asked the
same generic "tell me about yourself" questions as everyone else.

## Solution

Interviewer OS builds a personalized adaptive interviewer from:

```
candidate profile
        +
31-day curriculum
        +
candidate progress (missions completed / skipped / failed)
        +
interview responses
        +
Breeth memory
        =
a genuinely adaptive technical interview
```

## Core features (only what actually works)

- **Curriculum-grounded interviews** — every question is generated from a
  real day in the 31-day curriculum (real tools, real objectives), never
  invented topics.
- **Candidate-aware planning** — the interview plan factors in which
  curriculum missions the candidate actually completed, skipped, or failed.
- **Adaptive questioning** — question difficulty adjusts based on how well
  the previous answer scored.
- **Follow-up questions** — a weak or vague answer triggers a targeted,
  same-topic follow-up rather than moving on.
- **Persistent candidate memory via Breeth** — a knowledge gap identified on
  one question can concretely resurface in a *later* question, not just the
  immediate follow-up.
- **Voice interview** — questions are spoken aloud (browser
  SpeechSynthesis) with captions always visible; answers can be spoken and
  transcribed live (browser SpeechRecognition), with an editable transcript
  before submitting. Both fall back gracefully to text-only in unsupported
  browsers.
- **AI interviewer avatar** — an abstract, state-driven presence (idle /
  thinking / speaking / listening / processing) built from SVG + CSS, not a
  static image or a third-party avatar SDK.
- **Automatic silence handling** — the current answer can auto-submit after
  a configurable stretch of silence while actively listening.
- **Accessibility mode** — a calmer, higher-contrast, less animation-heavy
  presentation the candidate can opt into.
- **Interview integrity signals** — logs only real, observable browser
  events (tab switched away, window blur, fullscreen exited, camera/mic
  disconnected, prolonged silence). It does **not** do face detection,
  emotion detection, or behavioral scoring — there is no reliable
  dependency-free browser API for that, and this project does not fabricate
  signals it can't actually produce.
- **Structured final assessment** — summary, strengths, knowledge gaps, and
  recommended next steps, generated from the actual interview transcript.
- **Downloadable report** — the final assessment exports to PDF client-side.

## Architecture

```
Candidate
   ↓
Frontend (React + Vite)
   ↓
HTTP API — POST /api/interview  (single endpoint, session-based)
   ↓
Interview Orchestrator
   ├── Curriculum        (31-day curriculum.json, real tools/objectives)
   ├── Candidate Data     (candidates.json — completed/skipped/failed missions)
   ├── AI Model            (question generation + answer evaluation;
   │                        mock provider by default, Anthropic opt-in)
   ├── Adaptive Engine     (decides next difficulty / follow-up vs. new topic)
   └── Breeth Memory       (candidate insights persist across questions)
   ↓
Personalized, multi-turn Interview
   ↓
Final Assessment (summary / strengths / gaps / next steps)
```

The frontend never generates, hardcodes, or scores interview content
itself — it only renders whatever `POST /api/interview` returns.

## Why it's different

Most interview practice tools ask generic questions from a fixed bank.
Interviewer OS interviews the candidate based on their *actual* learning
journey — which curriculum days they struggled with, what they've already
proven they know — and Breeth lets useful insights from earlier in the
conversation persist and concretely shape a *later* question, not just an
immediate follow-up. The interviewer adapts difficulty and topic in real
time instead of following a script.

## Technology stack

**Backend:** Node.js, Express, `dotenv`, `cors`. No database — curriculum
and candidate data are read from JSON; interview state lives in memory per
session. AI provider: a deterministic mock (default, no API key needed) or
the real Anthropic Messages API (opt-in). Memory provider: a deterministic
mock (default) or the real Breeth REST API (opt-in).

**Frontend:** React 19 + Vite. Browser-native SpeechSynthesis,
SpeechRecognition, and `getUserMedia` — no avatar/video SDK. PDF export via
`html2canvas` + `jspdf`, client-side only.

## Local setup

**Backend:**

```bash
cd backend
npm install
cp .env.example .env
npm start
# → http://localhost:3000
```

**Frontend** (in a second terminal):

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
# → http://localhost:5173 (or whatever Vite prints)
```

Both run out of the box with **zero API keys** — `AI_PROVIDER=mock` and
`MEMORY_PROVIDER=mock` are the defaults, and are fully deterministic (used
by every automated test).

## Running the tests

```bash
cd backend
npm run test:all
```

Runs all 7 suites (data layer, intelligence engine, memory, Breeth
provider, JSON extraction, HTTP API, personalization) — 90 checks total.

```bash
cd frontend
npm run lint
npm run build
```

## Environment variables

**Backend** (`backend/.env.example`):

| Variable | Required? | Purpose |
|---|---|---|
| `PORT` | No (default `3000`) | HTTP port |
| `NODE_ENV` | No | `development` / `production` |
| `CORS_ORIGIN` | No (default `*`) | Allowed frontend origin(s), comma-separated |
| `AI_PROVIDER` | No (default `mock`) | `mock` or `anthropic` |
| `AI_API_KEY` | Only if `AI_PROVIDER=anthropic` | Anthropic API key — **server-side only, never sent to the browser** |
| `AI_MODEL` | No (default `claude-sonnet-4-6`) | Model name, only used with `anthropic` |
| `MEMORY_PROVIDER` | No (default `mock`) | `mock` or `breeth` |
| `BREETH_API_KEY` | Only if `MEMORY_PROVIDER=breeth` | Breeth `write`-scoped key — **server-side only** |
| `BREETH_BASE_URL`, `BREETH_GROUP_PREFIX`, `BREETH_EXTRACT_INTENT`, `BREETH_TIMEOUT_MS` | No | Breeth tuning, see comments in `.env.example` |

**Frontend** (`frontend/.env.example`):

| Variable | Required? | Purpose |
|---|---|---|
| `VITE_API_URL` | No (default `http://localhost:3000`) | Backend base URL |

No API key, model credential, or Breeth credential belongs on the
frontend — none exist there today, and every AI/memory call happens
server-side (verified — see "AI provider" and "Breeth production mode"
below).

## Running in "real" (non-mock) mode

To use a real model instead of the deterministic mock:

```bash
# backend/.env
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
```

To use real, persistent Breeth memory instead of the in-memory mock:

```bash
# backend/.env
MEMORY_PROVIDER=breeth
BREETH_API_KEY=ck_live_...
```

Both providers fail fast with a clear error if the provider is set but the
matching key is missing, rather than silently falling back — see
`backend/src/services/ai/anthropicAiProvider.js` and
`backend/src/memory/breethMemoryProvider.js`.

## Demo

**Live URL:** _[add your deployed frontend URL here before submitting]_

**Local demo, no setup beyond `npm install`:** on the landing page, use
"Try the demo" to skip onboarding and interview as the built-in demo
candidate (`CAND-003`, Emily Chen) immediately.

## AI usage

See [`PROMPTS.md`](./PROMPTS.md) for this project's AI usage log —
including an explicit, honest account of which parts of this codebase's
history this log could and couldn't verify.

## Known limitations / manual steps before submission

- **Git history was not auditable during this hardening pass** — the
  project archive provided to the AI assistant doing this work did not
  include a `.git` directory. Before submitting, run `git log --oneline`
  yourself and confirm the history honestly reflects real development (the
  hackathon explicitly checks this) — this assistant could not do that
  check for you.
- **Live demo URL** above is a placeholder — fill it in once deployed.
- **HTTPS in production**: camera/microphone/speech APIs require a secure
  context in most browsers. Make sure your deployed frontend is served over
  HTTPS.
- **Browser compatibility**: speech synthesis and recognition are optional
  enhancements — the interview works fully with typed answers and no
  camera/mic in every browser. Speech *recognition* specifically has the
  weakest support in Firefox; Chrome/Edge/Safari support it. Speech
  *synthesis* is broadly supported everywhere.

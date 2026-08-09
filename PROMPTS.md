# Interviewer OS — AI Usage Log

**A note on how this file was produced, before the log itself:**

This file was written by an AI assistant (Claude) that only has a direct
transcript of *some* of this project's development — specifically, the
sessions quoted verbatim below. The codebase clearly contains substantial
work this assistant instance was not present for: the intelligence engine
(planner/question generator/answer evaluator/adaptive engine), the Breeth
memory integration, the HTTP API contract, and most of the frontend's
voice/camera/integrity/accessibility features all already existed, fully
built and tested, by the time this assistant first saw them. Internal code
comments reference a "task brief" with numbered sections (e.g. "§7/§9",
"§11", "§15/§17", "§18") that this assistant has never seen — strong
evidence of prior sessions with their own prompts.

Per this task's explicit instruction not to fabricate a fake AI development
history, the sections below that this assistant cannot verify are marked
**[NOT AVAILABLE TO THIS ASSISTANT]** rather than filled in with plausible
-sounding invented prompts. **If you have the actual prompts from those
earlier sessions** (chat exports, a project log, another assistant's
history), please drop them into the matching section below — that's the
accurate, authentic content the hackathon is asking for, and this assistant
simply doesn't have it.

---

## 1. Initial Architecture — Backend Data Layer (Part 1)

**Context:** First backend task. The hackathon's curriculum.json,
candidates.json, and technical-spec.md had just been provided, and no
backend code existed yet.

**Prompt used** (abridged — the full prompt specified the exact folder
structure, explicitly forbade inventing curriculum/candidate fields not
present in the source files, and explicitly listed features to *not* build
yet: AI question generation, answer evaluation, adaptive follow-up,
Breeth integration, auth, voice, database):

> "You are helping me build a hackathon project called Interviewer OS... My
> responsibility is the complete backend/AI side... For this task, work ONLY
> on: Part 1 — Backend Foundation + Hackathon Data Layer... Inspect the
> provided hackathon files... Do not invent curriculum topics, candidate
> information, API requirements, or fields that are not present in the
> provided resources... Implement the data layer [with] validation and
> error handling... Add basic health endpoint... Do NOT implement [AI
> question generation / answer evaluation / adaptive follow-up / Breeth /
> auth / voice / database] yet."

**Purpose:** Establish a clean, tested foundation (`curriculum.service.js`,
`candidates.service.js`, error handling, `/health`) before any AI logic
existed, so later parts would have real data to build on instead of
placeholders.

**Result:** `backend/src/curriculum/`, `backend/src/candidates/`,
`backend/src/utils/errors.js`, `backend/src/middleware/errorHandler.js`,
`backend/src/api/health.routes.js`, `backend/src/server.js`, and a smoke
test script — all verified against the real provided JSON (31 curriculum
days, 20 candidates), not fabricated data.

---

## 2. Backend Interview Engine (Part 2 — planner, question generator,
answer evaluator, adaptive engine, orchestrator)

**[NOT AVAILABLE TO THIS ASSISTANT.]** The code in `backend/src/agent/`
(`interviewPlanner.js`, `questionGenerator.js`, `answerEvaluator.js`,
`adaptiveEngine.js`, `interviewOrchestrator.js`, etc.) and
`backend/src/services/ai/` already existed, complete and tested, before
this assistant saw the project. The backend's own README describes this as
"Part 2" of a task brief this assistant has never read.

---

## 3. Memory Integration (Part 3 — insight extraction, memory abstraction)

**[NOT AVAILABLE TO THIS ASSISTANT.]** `backend/src/memory/memoryProvider.js`,
`mockMemoryProvider.js`, and `backend/src/agent/{insightExtractor,
memoryIntegration}.js` already existed and were already tested
(`test-memory.js`) before this assistant's involvement.

---

## 4. Breeth Integration

**[NOT AVAILABLE TO THIS ASSISTANT.]** `backend/src/memory/breethMemoryProvider.js`
already existed, with detailed comments citing specific Breeth API docs
(REST endpoints, group_id isolation, auth scheme) that this assistant did
not verify. If the docs citations in that file's header comment came from
an actual prompt/session, that prompt is the authentic record for this
section — this assistant only read and tested the resulting code.

---

## 5. API Integration (Part 4 — the `POST /api/interview` HTTP contract)

**[NOT AVAILABLE TO THIS ASSISTANT.]** `backend/src/api/interview.routes.js`,
`sessionStore.js`, `feedbackMapper.js`, and their HTTP-level tests
(`test-http-api.js`) already existed before this assistant saw the project.
This assistant did rely on this exact, unmodified contract (documented in
`backend/src/api/interview.routes.js` and mirrored in
`frontend/src/services/api.js`) as the fixed interface for the frontend
work in sections 6–8 below — that reliance is real, even though the
contract's original design prompt isn't available here.

---

## 6. Frontend — Initial Redesign

**Context:** An earlier, simpler frontend existed (a working chatbot-style
form calling the same `POST /api/interview` contract). The request was to
redesign the *experience* into a premium AI video-interview feel without
touching the backend contract.

**Prompt used** (abridged):

> "We are NOT rebuilding Interviewer OS. The existing backend and API
> integration are working and must be preserved. I want you to redesign and
> upgrade ONLY the frontend experience into a polished, premium AI
> video-interview platform... DO NOT modify or duplicate the backend
> intelligence... The frontend only consumes: POST /api/interview... Use
> browser-supported Speech Synthesis... Implement browser speech
> recognition... Use browser getUserMedia for a candidate camera preview...
> Do NOT claim that the system performs emotion detection, facial scoring,
> eye tracking or behavioral analysis unless such functionality actually
> exists."

**Purpose:** Turn a functional-but-plain chatbot UI into something that
feels like an actual AI interview session, while keeping the exact same
backend contract, and — explicitly — without ever claiming a capability
(emotion detection, behavioral scoring) that wasn't real.

**Result:** `hooks/useSpeechSynthesis.js`, `hooks/useSpeechRecognition.js`,
an SVG/CSS state-driven AI avatar, a camera preview component, a
pre-interview device-check screen, and a redesigned report page — all
built against the unmodified `POST /api/interview` contract. (This
assistant's own build from that session was later extended further —
onboarding steps, integrity monitoring, accessibility mode, silence
auto-submit, PDF export — in session(s) this assistant has no transcript
of; see section 8.)

---

## 7. UI/UX

**Partially available.** The visual system (dark, restrained accent color,
avatar states, camera/answer panel layout) from section 6 is this
assistant's own work. The onboarding flow (`ProfileStep`,
`AccessibilityStep`, `DeviceCheckStep`, `EnvironmentStep`), the interview
-room subcomponents in `components/interview/`, and the expanded report
(coverage bar, integrity panel) were **[NOT AVAILABLE TO THIS ASSISTANT]**
— built in session(s) between the initial redesign and this hardening pass.

---

## 8. Voice / Interview Experience

**Partially available.** Text-to-speech (`useSpeechSynthesis.js`) and
speech-to-text (`useSpeechRecognition.js`) are this assistant's work from
section 6. Camera as its own hook (`useCamera.js`), the separate mic-stream
hook (`useMicStream.js`), live audio-level metering (`useAudioLevel.js`),
automatic silence detection (`useSilenceAutoSubmit.js`), and the interview
integrity monitor (`useIntegrityMonitor.js`) are **[NOT AVAILABLE TO THIS
ASSISTANT]** — this assistant read and tested this code during hardening
(see section 10) but did not write the prompts that produced it.

---

## 9. Testing / Debugging

**[NOT AVAILABLE TO THIS ASSISTANT]** for the original authorship of
`backend/scripts/test-*.js` (data layer, intelligence engine, memory,
Breeth provider, JSON extraction, HTTP API, personalization — 7 suites, 90
checks total). This assistant *ran* every one of these suites during
hardening (section 10) and confirmed all 90 checks pass, but did not write
them.

---

## 10. Final Polish — Hackathon Hardening & Submission Prep

**Context:** The product was declared feature-complete. The task was to
prepare the existing repository for public judging: run every test suite,
audit environment variables and secrets, verify Breeth/AI provider
configuration stays server-side, write this file and the root README, and
do a full judge-style end-to-end demo pass — explicitly *without* adding
new features.

**Prompt used** (abridged):

> "The product is now feature-complete. Do NOT add major new features. Your
> task is to prepare the repository for public judging and deployment...
> Run the complete available test suite. Fix only real issues... Search the
> repository for: ck_live_, API keys, tokens, secrets... Create PROMPTS.md...
> Do NOT fabricate a fake AI development history... Create a judge-friendly
> README... Perform the complete user journey... At the end provide: build
> result, complete test result, environment variables required, deployment
> requirements, files created/changed..."

**Purpose:** Turn a feature-complete but unaudited codebase into something
safe and coherent to hand to judges: proof every test passes, proof no
secret is committed, an honest account of AI usage (this file), and a
README a judge can actually use in the 30-second/no-explanation test the
brief itself proposes.

**Result:**
- Ran all 7 backend test suites (90/90 checks pass) and the frontend
  lint/build (both clean).
- Added the backend's missing `.gitignore` (real risk: no `.env` protection
  existed).
- Removed a dead, unused hardcoded-question file
  (`frontend/src/data/questions.js`) that had no import anywhere but was
  risky to leave in a judged repo given the product's "never hardcode
  questions" requirement.
- Found and fixed a real (scoped, test-verified) bug: the mock AI
  provider's `strengths` output surfaced meaningless stopwords ("whether",
  "between") instead of real technical terms, because its keyword extractor
  had no stopword filter. Fixed with a scoped filter in
  `services/ai/mockAiProvider.js`; re-ran all 90 checks to confirm nothing
  broke.
- Rewrote `frontend/README.md` (was still the unedited Vite template) and
  corrected a stale line in `backend/README.md`.
- Wrote this file and the root `README.md`.
- Ran a full demo interview through `POST /api/interview` to completion
  (10 questions, 5 curriculum days, correctly-shaped final feedback) to
  verify the judge-facing user journey actually works end to end.
- Could **not** audit git commit history (`git log --oneline`) or confirm
  authentic commit dates — the provided project archive does not include a
  `.git` directory. This is listed as a manual step in the root README.

# Interviewer OS — Frontend

React + Vite frontend for **Interviewer OS**. Consumes the backend's single
endpoint, `POST /api/interview` (see `../backend`), and never generates,
hardcodes, or fabricates interview questions, evaluations, or scores itself
— every question, follow-up, and piece of final feedback shown here came
from that one backend call. See the [root README](../README.md) for the
full product picture.

## What's actually implemented

- **Onboarding flow**: profile capture → accessibility mode toggle → device
  check (camera/mic) → environment check → live interview → report.
  A "Try the demo" path on the landing page skips onboarding and jumps
  straight into the interview as the known demo candidate (`CAND-003`,
  Emily Chen), for a fast judge-facing walkthrough.
- **AI interviewer avatar** (`components/avatar`): an abstract, state-driven
  presence (idle / thinking / speaking / listening / processing) built from
  SVG + CSS — no static image, no third-party avatar SDK.
- **Voice**: questions are spoken via the browser's SpeechSynthesis API
  (`hooks/useSpeechSynthesis.js`) with captions always visible alongside the
  audio, and mute/replay controls. Falls back to text-only when speech
  synthesis isn't supported.
- **Speech-to-text**: candidate answers can be spoken and transcribed live
  via the browser's SpeechRecognition API (`hooks/useSpeechRecognition.js`),
  with an editable transcript before submitting. Falls back to a plain text
  box when unsupported (e.g. Firefox).
- **Automatic silence handling** (`hooks/useSilenceAutoSubmit.js`): if the
  candidate stops speaking for a configured stretch while actively
  answering, the current transcript can auto-submit — a UI convenience, not
  a backend feature.
- **Camera preview** (`hooks/useCamera.js`): shows the candidate's own video
  back to them as part of the interview-room feel. It is not analyzed —
  there is no emotion detection, face detection, or behavioral scoring
  anywhere in this codebase.
- **Interview integrity signals** (`hooks/useIntegrityMonitor.js`,
  `components/interview/IntegrityBadge.jsx`): logs only real, observable
  browser events — tab switched away, window blur, fullscreen exited,
  camera/mic track ended, prolonged silence while listening. It never
  infers honesty, attention, or emotional state.
- **Accessibility mode** (`components/steps/AccessibilityStep.jsx`): a
  candidate-facing toggle for a calmer, higher-contrast, less
  animation-heavy interview presentation.
- **Report + PDF export**: the final screen renders the backend's actual
  `feedback.{summary,strengths,gaps,next}` plus the full question/answer
  transcript and the integrity log, and can export that same view to a PDF
  client-side (`html2canvas` + `jspdf`) — no server round-trip, no invented
  metrics beyond counts of the backend's own strengths/gaps arrays.

## Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── steps/          # onboarding: Profile, Accessibility, DeviceCheck, Environment
│   │   ├── interview/      # AnswerPanel, CandidateCameraTile, IntegrityBadge, MicLevelMeter
│   │   ├── avatar/          # the AI interviewer avatar (state machine + CSS)
│   │   ├── Interview.jsx    # orchestrates one live interview session
│   │   ├── Report.jsx       # final assessment + PDF export
│   │   └── Hero.jsx, Navbar.jsx, Features.jsx
│   ├── hooks/                # useCamera, useMicStream, useAudioLevel,
│   │                         # useSpeechSynthesis, useSpeechRecognition,
│   │                         # useSilenceAutoSubmit, useIntegrityMonitor
│   ├── services/api.js       # the ONLY place that calls the backend
│   ├── config/interviewer.js # AI interviewer display identity (name/role)
│   └── data/knownCandidates.js # maps a chosen target role -> an existing
│                                 backend candidate id (see file header)
├── .env.example
└── package.json
```

## Install & run

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_URL if the backend isn't on localhost:3000
npm run dev
```

## Build

```bash
npm run build
```

## Lint

```bash
npm run lint
```

## Environment variables

See `.env.example`. Only one variable exists on the frontend:

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Base URL of the backend (defaults to `http://localhost:3000` if unset) |

No API keys, model credentials, or Breeth credentials belong on the
frontend — those stay server-side (see `../backend/README.md`).

## Browser compatibility

Speech synthesis and speech recognition are optional enhancements, not
requirements — the interview always works with camera/mic off and typed
answers. See the root README's "Browser compatibility" section for the
current state of each browser.

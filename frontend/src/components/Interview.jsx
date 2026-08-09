import { useEffect, useRef, useState } from "react";
import { startInterview, sendAnswer } from "../services/api";
import { useSpeechSynthesis } from "../hooks/useSpeechSynthesis";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useIntegrityMonitor } from "../hooks/useIntegrityMonitor";
import { useSilenceAutoSubmit } from "../hooks/useSilenceAutoSubmit";
import InterviewStage from "./interview/InterviewStage";
import CandidateCameraTile from "./interview/CandidateCameraTile";
import AnswerPanel from "./interview/AnswerPanel";
import IntegrityBadge from "./interview/IntegrityBadge";

const INTRO_TEXT =
  "Hello, I'm your AI interviewer. I'll be conducting your technical " +
  "interview today. I'll ask questions based on your profile and adapt " +
  "the interview according to your responses. Please answer naturally " +
  "and take your time. Whenever you're ready, let's begin.";

const CLOSING_TEXT =
  "Thank you for taking the time to complete the interview. Your " +
  "assessment is now ready.";

// Short, professional conversational acknowledgements — never scores or
// correctness, just enough to make the exchange feel like a conversation
// rather than a form. Matches the exact tone/examples in the product spec.
const ACKNOWLEDGEMENTS = [
  "Good direction — let's explore that idea a little further.",
  "That's a useful example. Let's go one level deeper.",
  "Good start. Think a little more about the trade-off involved.",
  "That gives me a useful picture of your approach.",
  "The core idea is clear. Let's test it with another scenario.",
];

/**
 * Orchestrates the full live interview room: AI introduction, backend-driven
 * questions spoken aloud with progressive captions, automatic listen/silence
 * handling, a brief spoken acknowledgement between turns, integrity
 * monitoring, and the transition into the final report.
 *
 * No question content is generated or hardcoded here — every word the
 * avatar "says" (other than the fixed intro/closing lines and the short
 * client-side acknowledgements) is the backend's own `reply`. The only two
 * backend calls this file makes are unchanged: startInterview(sessionId,
 * candidate) and sendAnswer(sessionId, message), both hitting
 * POST /api/interview.
 */
function Interview({ candidateId, candidateDisplayName, accessibilityMode, camera, micStream, onFinish }) {
  const [sessionId] = useState(() => crypto.randomUUID());

  // "intro" | "starting" | "speaking" | "listening" | "acknowledging" |
  // "submitting" | "closing" | "done"
  const [phase, setPhase] = useState("intro");
  const [currentReply, setCurrentReply] = useState("");
  const [conversation, setConversation] = useState([]);
  const [turnCount, setTurnCount] = useState(0);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const [mouthPulse, setMouthPulse] = useState(0);
  const [captionRevealCount, setCaptionRevealCount] = useState(999);

  const hasStartedRef = useRef(false);
  const draftRef = useRef("");

  const speech = useSpeechSynthesis();
  const recognition = useSpeechRecognition();
  const integrity = useIntegrityMonitor();

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;

    if (!camera.stream) camera.enable();
    if (!micStream.stream) micStream.enable();

    setPhase("intro");
    setCaptionRevealCount(1);
    speech.speak(INTRO_TEXT, {
      onBoundary: () => {
        setMouthPulse((p) => p + 1);
        setCaptionRevealCount((c) => c + 1);
      },
      onEnd: () => beginInterview(),
    });

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watch camera/mic tracks for unexpected loss (integrity signal).
  useEffect(() => integrity.watchMediaStream(camera.stream, "video"), [camera.stream, integrity]);
  useEffect(() => integrity.watchMediaStream(micStream.stream, "audio"), [micStream.stream, integrity]);

  function speakLine(text, onEnd) {
    setCaptionRevealCount(1);
    speech.speak(text, {
      onBoundary: () => {
        setMouthPulse((p) => p + 1);
        setCaptionRevealCount((c) => c + 1);
      },
      onEnd,
    });
  }

  function startListening() {
    recognition.reset();
    setDraft("");
    if (!accessibilityMode && recognition.isSupported) {
      recognition.start();
    }
    setPhase("listening");
  }

  async function beginInterview() {
    setPhase("starting");
    setError(null);
    try {
      const result = await startInterview(sessionId, { id: candidateId });
      setCurrentReply(result.reply);
      setConversation([{ role: "interviewer", text: result.reply }]);

      if (result.done) {
        finishWithClosing(result.feedback ?? null, [{ role: "interviewer", text: result.reply }]);
        return;
      }

      setPhase("speaking");
      speakLine(result.reply, () => startListening());
    } catch (err) {
      setError(err.message);
      setPhase("listening");
    }
  }

  function finishWithClosing(feedback, finalTranscript) {
    setPhase("closing");
    speakLine(CLOSING_TEXT, () => {
      setPhase("done");
      onFinish(feedback, finalTranscript, {
        events: integrity.events,
        summary: integrity.summary,
      });
    });
  }

  async function submitAnswer(rawText) {
    const text = (rawText ?? draftRef.current).trim();
    if (!text || phase !== "listening") return;

    recognition.stop();

    const candidateTurn = { role: "candidate", text };
    const conversationSoFar = [...conversation, candidateTurn];
    setConversation(conversationSoFar);
    setPhase("submitting");
    setError(null);
    setDraft("");

    try {
      const result = await sendAnswer(sessionId, text);
      const updatedConversation = [...conversationSoFar, { role: "interviewer", text: result.reply }];

      setConversation(updatedConversation);
      setCurrentReply(result.reply);
      setTurnCount((count) => count + 1);

      if (result.done) {
        finishWithClosing(result.feedback ?? null, updatedConversation);
        return;
      }

      // Brief conversational acknowledgement, then the next question —
      // never scores, correctness, or evaluation detail.
      setPhase("acknowledging");
      const ack = ACKNOWLEDGEMENTS[turnCount % ACKNOWLEDGEMENTS.length];
      speakLine(ack, () => {
        setPhase("speaking");
        speakLine(result.reply, () => startListening());
      });
    } catch (err) {
      setConversation(conversation);
      setDraft(text);
      setError(err.message);
      setPhase("listening");
    }
  }

  // Auto-submit once the candidate has spoken and then gone quiet — the
  // primary flow. A manual "Finish Answer" control (in AnswerPanel) remains
  // available as a fallback.
  useSilenceAutoSubmit({
    active: phase === "listening" && !accessibilityMode,
    stream: micStream.stream,
    hasSpeech: Boolean(`${recognition.finalTranscript}${recognition.interimTranscript}`.trim()),
    onSilence: () => {
      const spoken = `${recognition.finalTranscript}${recognition.interimTranscript}`.trim();
      if (spoken) submitAnswer(spoken);
    },
  });

  function handleManualSubmit() {
    // Typed UI covers both explicit accessibility mode and the fallback for
    // browsers with no SpeechRecognition support at all (see AnswerPanel).
    if (accessibilityMode || !recognition.isSupported) {
      submitAnswer(draft);
    } else {
      const spoken = `${recognition.finalTranscript}${recognition.interimTranscript}`.trim();
      submitAnswer(spoken);
    }
  }

  function handleEndInterview() {
    if (!window.confirm("End the interview now? You'll see a report based on what's been answered so far.")) {
      return;
    }
    recognition.stop();
    speech.cancel();
    onFinish(null, conversation, { events: integrity.events, summary: integrity.summary });
  }

  const avatarState =
    phase === "intro"
      ? "introducing"
      : phase === "closing"
        ? "speaking"
        : phase === "done"
          ? "completed"
          : phase === "speaking" || phase === "acknowledging"
            ? "speaking"
            : phase === "starting"
              ? "thinking"
              : phase === "submitting"
                ? "processing"
                : phase === "listening"
                  ? "listening"
                  : "idle";

  const caption =
    phase === "intro"
      ? INTRO_TEXT
      : phase === "closing"
        ? CLOSING_TEXT
        : phase === "starting"
          ? "Preparing your interview…"
          : phase === "submitting"
            ? "Thinking about your answer…"
            : currentReply;

  const isSpeakingPhase = ["intro", "speaking", "acknowledging", "closing"].includes(phase);

  return (
    <div className="interview-room">
      <IntegrityBadge summary={integrity.summary} events={integrity.events} />

      <header className="room-topbar">
        <span className="room-brand">
          INTERVIEWER OS <span className="live-pill"><span className="live-dot" />LIVE</span>
        </span>
        <span className="room-progress">
          {candidateDisplayName ? `${candidateDisplayName} · ` : ""}
          {turnCount === 0 ? "Getting started" : `Question ${turnCount + 1}`}
        </span>
      </header>

      {error && (
        <div className="interview-error">
          <span>{error}</span>
        </div>
      )}

      <div className="room-stage-area">
        <InterviewStage
          avatarState={avatarState}
          caption={caption}
          revealCount={captionRevealCount}
          progressive={isSpeakingPhase}
          micStream={micStream.stream}
          mouthPulse={mouthPulse}
        />

        <CandidateCameraTile camera={camera} listening={phase === "listening"} />
      </div>

      <AnswerPanel
        phase={phase}
        recognition={recognition}
        micStream={micStream.stream}
        draft={draft}
        onDraftChange={setDraft}
        onManualSubmit={handleManualSubmit}
        accessibilityMode={accessibilityMode}
        onAudioLevel={integrity.noteAudioLevel}
      />

      <footer className="room-controls">
        <button
          type="button"
          className={`icon-button ${recognition.isListening ? "is-active" : ""}`}
          onClick={() => {
            if (recognition.isListening) recognition.stop();
            else if (phase === "listening") recognition.start();
          }}
          aria-pressed={recognition.isListening}
          disabled={accessibilityMode || phase !== "listening"}
          title="Microphone"
        >
          🎙
        </button>

        <button
          type="button"
          className={`icon-button ${speech.isMuted ? "is-active" : ""}`}
          onClick={speech.toggleMute}
          aria-pressed={speech.isMuted}
          disabled={!speech.isSupported}
          title={speech.isMuted ? "Unmute" : "Mute"}
        >
          {speech.isMuted ? "🔇" : "🔊"}
        </button>

        <button
          type="button"
          className="icon-button icon-button-small"
          onClick={speech.replay}
          disabled={!speech.isSupported || isSpeakingPhase}
          title="Replay question"
        >
          ↺
        </button>

        <button type="button" className="end-interview-button" onClick={handleEndInterview} title="End interview">
          ⏹ End Interview
        </button>
      </footer>
    </div>
  );
}

export default Interview;

import { useAudioLevel } from "../../hooks/useAudioLevel";
import MicLevelMeter from "./MicLevelMeter";

/**
 * Where the candidate answers.
 *
 * Normal mode (accessibilityMode=false): voice only. Listening starts
 * automatically once the interviewer finishes speaking — there is no
 * "Type your answer" box on screen, matching the "real spoken interview"
 * requirement. The candidate's own live transcript is shown as a small
 * caption so they can see it's being heard; a "Finish Answer" control is
 * available as a manual fallback to the automatic silence-based submit.
 *
 * Accessibility mode: a plain textarea replaces the voice UI entirely, with
 * its own submit control. No disclosure or category was required to reach
 * this mode (see AccessibilityStep) — it's just a toggle.
 */
function AnswerPanel({
  phase,
  recognition,
  micStream,
  draft,
  onDraftChange,
  onManualSubmit,
  accessibilityMode,
  onAudioLevel,
}) {
  const isListening = phase === "listening";

  useAudioLevel(isListening ? micStream : null, (level) => {
    onAudioLevel?.(level, isListening);
  });

  // Accessibility mode chose typing explicitly. Separately, if this browser
  // simply doesn't support SpeechRecognition at all, fall back to the same
  // typed UI so the candidate always has a way to answer — never claim a
  // voice-only interview when the API isn't actually there.
  const useTypedUI = accessibilityMode || !recognition.isSupported;

  if (useTypedUI) {
    const canSubmit = draft.trim().length > 0 && phase === "listening";
    return (
      <section className="answer-panel answer-panel-typed">
        <div className="answer-panel-top">
          <span className="panel-eyebrow">
            {accessibilityMode ? "⌨ TYPE YOUR RESPONSE" : "⌨ TYPE YOUR RESPONSE"}
          </span>
          {!accessibilityMode && (
            <span className="stage-fallback-note">
              Speech recognition isn't supported in this browser — type your answer instead.
            </span>
          )}
        </div>
        <textarea
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onManualSubmit();
            }
          }}
          placeholder="Type your answer here…"
          rows={4}
          disabled={phase !== "listening"}
        />
        <div className="answer-panel-actions">
          <span>⌘/Ctrl + Enter also submits</span>
          <button
            type="button"
            className="hero-button"
            onClick={onManualSubmit}
            disabled={!canSubmit}
          >
            Submit Answer →
          </button>
        </div>
      </section>
    );
  }

  const liveTranscript = `${recognition.finalTranscript}${recognition.interimTranscript}`.trim();

  return (
    <div className="voice-answer-bar">
      {isListening ? (
        <>
          <div className="voice-answer-indicator">
            <MicLevelMeter stream={micStream} bars={5} />
            <span>🎙 Listening…</span>
          </div>

          {liveTranscript && <p className="voice-answer-transcript">{liveTranscript}</p>}

          <button
            type="button"
            className="ghost-button ghost-button-small"
            onClick={onManualSubmit}
            disabled={!liveTranscript}
          >
            Finish Answer
          </button>
        </>
      ) : (
        <span className="voice-answer-hint">
          {phase === "speaking" || phase === "acknowledging" || phase === "intro"
            ? "🎙 Speak your answer — listening starts automatically"
            : phase === "processing" || phase === "submitting"
              ? "🧠 Thinking about your answer…"
              : ""}
        </span>
      )}
    </div>
  );
}

export default AnswerPanel;

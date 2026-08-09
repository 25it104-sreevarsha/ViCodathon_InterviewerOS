import AIAvatar from "../avatar/AIAvatar";
import { interviewerProfile } from "../../config/interviewer";

const STATUS_LABEL = {
  introducing: "Speaking",
  thinking: "Preparing",
  speaking: "Speaking",
  acknowledging: "Speaking",
  listening: "Listening",
  processing: "Thinking",
  idle: "Ready",
  completed: "Complete",
};

/**
 * The hero panel — the AI interviewer's stage. This is deliberately the
 * visual center of gravity of the whole interview room: a large portrait
 * frame, a short subtitle-style caption underneath it (revealed
 * progressively in sync with real TTS word-boundary timing, not a fixed
 * typewriter animation), and a single small status pill. No large card,
 * no long paragraphs, no setup chrome.
 */
function InterviewStage({ avatarState, caption, revealCount, progressive, micStream, mouthPulse }) {
  const words = caption ? caption.split(" ") : [];
  const shownCaption = progressive ? words.slice(0, Math.max(revealCount, 1)).join(" ") : caption;

  return (
    <section className="stage-panel">
      <div className="stage-avatar-wrap">
        <AIAvatar state={avatarState} micStream={micStream} pulse={mouthPulse} />
      </div>

      <div className="stage-caption-area">
        <span className="status-pill" data-state={avatarState}>
          <span className="status-pill-dot" />
          {interviewerProfile.name} · {STATUS_LABEL[avatarState] || STATUS_LABEL.idle}
        </span>

        {shownCaption && <p className="stage-caption">{shownCaption}</p>}
      </div>
    </section>
  );
}

export default InterviewStage;

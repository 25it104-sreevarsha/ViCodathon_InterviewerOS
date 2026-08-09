import { useRef } from "react";
import { useAudioLevel } from "../../hooks/useAudioLevel";
import { interviewerProfile } from "../../config/interviewer";

/**
 * The AI interviewer's on-screen presence.
 *
 * Two render modes, same states and CSS hooks either way:
 *  - "human": a licensed portrait (interviewerProfile.image) with a
 *    lightweight speaking overlay near the mouth, calibrated per-photo via
 *    interviewerProfile.mouthAnchor. No face-landmark detection is used —
 *    the overlay position is a manual calibration, not a detection result.
 *  - "orb": the abstract neural-core fallback, used automatically whenever
 *    no licensed image has been configured (nothing here scrapes or
 *    fabricates a photo).
 *
 * States: idle | introducing | speaking | listening | thinking | processing | completed
 *
 * `pulse` is an incrementing number driven by TTS word-boundary events
 * (see useSpeechSynthesis). Each increment remounts the mouth-pulse element
 * (via `key={pulse}`), replaying a short CSS "open" animation once — a
 * rough, honest approximation of speech timing, not phoneme-accurate
 * lip-sync. A future viseme/phoneme provider could drive the same `pulse`
 * prop without changing this component's contract.
 */
function AIAvatar({ state = "idle", micStream = null, pulse = 0 }) {
  const levelRingRef = useRef(null);

  useAudioLevel(state === "listening" ? micStream : null, (level) => {
    if (levelRingRef.current) {
      levelRingRef.current.style.setProperty("--level", level.toFixed(3));
    }
  });

  const hasPhoto = Boolean(interviewerProfile.image);
  const anchor = interviewerProfile.mouthAnchor;

  return (
    <div
      className={`ai-avatar ${hasPhoto ? "ai-avatar-human" : "ai-avatar-orb"}`}
      data-state={state}
      aria-hidden="true"
    >
      <div className="avatar-halo" />
      <div className="avatar-listen-ring" ref={levelRingRef} />

      <div className="avatar-orbit">
        <span />
        <span />
        <span />
      </div>

      {state === "completed" && <div className="avatar-complete-badge">✓</div>}

      {hasPhoto ? (
        <div className="avatar-photo-frame">
          <img
            src={interviewerProfile.image}
            alt={`${interviewerProfile.name}, AI interviewer`}
            className="avatar-photo"
          />
          <div
            key={pulse}
            className="avatar-mouth-overlay"
            style={{
              left: `${anchor.xPercent}%`,
              top: `${anchor.yPercent}%`,
              width: `${anchor.widthPercent}%`,
            }}
          />
        </div>
      ) : (
        <svg className="avatar-core" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="avatarCoreGradient" cx="42%" cy="34%" r="72%">
              <stop offset="0%" stopColor="#c2c9ff" />
              <stop offset="45%" stopColor="#6c7cff" />
              <stop offset="100%" stopColor="#33356f" />
            </radialGradient>
          </defs>

          {/* Soft outer rim for a glassier, more dimensional presence */}
          <circle className="avatar-core-rim" cx="100" cy="100" r="63" />

          <circle className="avatar-core-circle" cx="100" cy="100" r="58" fill="url(#avatarCoreGradient)" />

          {/* Gentle top-left specular highlight, suggesting studio light */}
          <ellipse className="avatar-core-highlight" cx="76" cy="66" rx="22" ry="14" transform="rotate(-25 76 66)" />

          <g className="avatar-eyes">
            <ellipse cx="80" cy="90" rx="5.5" ry="8" />
            <ellipse cx="120" cy="90" rx="5.5" ry="8" />
          </g>

          <g className="avatar-bars" key={pulse}>
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <rect
                key={i}
                className={`avatar-bar avatar-bar-${i}`}
                x={68 + i * 9.5}
                y="118"
                width="5"
                height="10"
                rx="2.5"
              />
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}

export default AIAvatar;

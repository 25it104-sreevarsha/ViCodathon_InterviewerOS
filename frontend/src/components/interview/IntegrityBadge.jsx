import { useState } from "react";

const RISK_LABEL = {
  clear: "Session normal",
  low: "Session normal",
  medium: "Attention interrupted",
  high: "Review recommended",
  critical: "Review required",
};

const EVENT_LABEL = {
  TAB_HIDDEN: "Tab switched away",
  WINDOW_BLUR: "Window lost focus",
  FULLSCREEN_EXITED: "Fullscreen exited",
  CAMERA_LOST: "Camera disconnected",
  MIC_LOST: "Microphone disconnected",
  PROLONGED_SILENCE: "Extended silence",
};

/**
 * A small, unobtrusive corner indicator — not a banner, not an accusation.
 * Shows the current risk level from real recorded events only, with an
 * expandable log so the candidate can see exactly what was logged.
 */
function IntegrityBadge({ summary, events }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`integrity-badge risk-${summary.riskLevel}`}>
      <button
        type="button"
        className="integrity-badge-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
      >
        <span className="integrity-dot" />
        🔒 {RISK_LABEL[summary.riskLevel]}
      </button>

      {expanded && (
        <div className="integrity-log">
          {events.length === 0 ? (
            <p>No integrity events recorded.</p>
          ) : (
            <ul>
              {events
                .slice(-6)
                .reverse()
                .map((event, index) => (
                  <li key={index}>
                    <span>{EVENT_LABEL[event.type] || event.type}</span>
                    <time>{new Date(event.timestamp).toLocaleTimeString()}</time>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default IntegrityBadge;

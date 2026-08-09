import { useEffect, useState } from "react";
import StepProgress from "./StepProgress";
import { useAudioLevel } from "../../hooks/useAudioLevel";

/**
 * STEP 4 — a calm, honest pre-check. This only reports signals a browser
 * can genuinely verify: the camera track is live, the microphone is
 * picking up sound, and the tab is in the foreground. It deliberately does
 * NOT claim face detection, multiple-face detection, gaze tracking, or
 * emotion detection — there's no reliable dependency-free browser API for
 * those, and fabricating the signal would be worse than not showing it.
 * (Full-interview monitoring for the same honest signal set continues via
 * useIntegrityMonitor once the interview begins.)
 */
function EnvironmentStep({ onContinue, onBack, camera, micStream }) {
  const [micHeard, setMicHeard] = useState(false);
  const [tabActive, setTabActive] = useState(document.visibilityState === "visible");

  useAudioLevel(micStream.stream, (level) => {
    if (level > 0.04) setMicHeard(true);
  });

  useEffect(() => {
    function handleVisibility() {
      setTabActive(document.visibilityState === "visible");
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const cameraActive = Boolean(camera.stream?.getVideoTracks?.().some((t) => t.readyState === "live"));
  const micActive = Boolean(micStream.stream);

  const checks = [
    { ok: cameraActive, label: "Camera active" },
    { ok: micActive && micHeard, label: "Microphone active" },
    { ok: tabActive, label: "Browser tab active" },
  ];

  const allOk = checks.every((c) => c.ok);

  return (
    <main className="onboarding-page">
      <StepProgress current={4} />

      <div className="onboarding-head">
        <p className="hero-label">STEP 4 OF 5</p>
        <h1>One last check before we begin</h1>
        <p className="onboarding-subtitle">These checks help keep the interview fair for everyone.</p>
      </div>

      <ul className="environment-check-list">
        {checks.map((check) => (
          <li key={check.label} className={check.ok ? "is-ok" : "is-pending"}>
            <span className="check-mark">{check.ok ? "✓" : "○"}</span>
            {check.label}
          </li>
        ))}
      </ul>

      {!allOk && (
        <p className="question-hint">
          {!micHeard && micActive ? "Say something so we can confirm your microphone is picking up sound." : "Waiting for all checks to complete…"}
        </p>
      )}

      <p className="environment-note">
        During the interview, we'll keep a light, ongoing check on these same signals — camera and
        microphone connection, and whether the tab stays in focus. A single accidental interruption
        won't affect your interview; only repeated or prolonged issues are noted in your integrity
        summary. We don't perform facial recognition, gaze tracking, or emotion analysis.
      </p>

      <div className="onboarding-actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="hero-button hero-button-large" onClick={onContinue} disabled={!allOk}>
          Enter Interview Room →
        </button>
      </div>
    </main>
  );
}

export default EnvironmentStep;

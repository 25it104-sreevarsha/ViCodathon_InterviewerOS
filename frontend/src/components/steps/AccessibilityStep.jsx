import { useState } from "react";
import StepProgress from "./StepProgress";

/**
 * STEP 2 — asks one question, plainly. No category picker, no medical
 * detail required. The free-text note is entirely optional and only used
 * to decide whether to surface the typed-answer option later.
 */
function AccessibilityStep({ onContinue, onBack }) {
  const [choice, setChoice] = useState(null); // "voice" | "alternative"
  const [note, setNote] = useState("");

  function handleContinue() {
    onContinue({ accessibilityMode: choice === "alternative", note: choice === "alternative" ? note.trim() : "" });
  }

  return (
    <main className="onboarding-page">
      <StepProgress current={2} />

      <div className="onboarding-head">
        <p className="hero-label">STEP 2 OF 5</p>
        <h1>Do you need an alternative way to respond?</h1>
        <p className="onboarding-subtitle">
          Most candidates answer by speaking. If that doesn't work for you, we'll switch to typed responses instead.
        </p>
      </div>

      <div className="choice-grid">
        <button
          type="button"
          className={`choice-card ${choice === "voice" ? "is-selected" : ""}`}
          onClick={() => setChoice("voice")}
        >
          <span className="choice-icon">🎙</span>
          <strong>No, I'll use voice</strong>
          <span>Speak your answers naturally during the interview.</span>
        </button>

        <button
          type="button"
          className={`choice-card ${choice === "alternative" ? "is-selected" : ""}`}
          onClick={() => setChoice("alternative")}
        >
          <span className="choice-icon">⌨</span>
          <strong>Yes, I need accessibility support</strong>
          <span>Type your answers instead of speaking them.</span>
        </button>
      </div>

      {choice === "alternative" && (
        <label className="form-field form-field-wide accessibility-note">
          <span>Tell us what support you need <em>(optional)</em></span>
          <textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — only share what's helpful for us to know."
          />
        </label>
      )}

      <div className="onboarding-actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="hero-button hero-button-large" onClick={handleContinue} disabled={!choice}>
          Continue →
        </button>
      </div>
    </main>
  );
}

export default AccessibilityStep;

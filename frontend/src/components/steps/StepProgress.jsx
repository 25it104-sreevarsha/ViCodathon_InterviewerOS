const STEPS = ["Profile", "Accessibility", "System Check", "Environment", "Interview"];

/**
 * Keeps the candidate oriented across the multi-step onboarding flow.
 * `current` is 1-indexed to match STEP 1..5 in the product spec.
 */
function StepProgress({ current }) {
  return (
    <ol className="step-progress" aria-label="Onboarding progress">
      {STEPS.map((label, index) => {
        const stepNumber = index + 1;
        const state =
          stepNumber === current ? "current" : stepNumber < current ? "done" : "upcoming";
        return (
          <li key={label} className={`step-progress-item is-${state}`}>
            <span className="step-progress-dot">{state === "done" ? "✓" : stepNumber}</span>
            <span className="step-progress-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default StepProgress;

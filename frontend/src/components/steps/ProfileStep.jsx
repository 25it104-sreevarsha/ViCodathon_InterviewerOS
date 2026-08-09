import { useState } from "react";
import StepProgress from "./StepProgress";
import { getRoleOptions } from "../../data/knownCandidates";

const EXPERIENCE_LEVELS = ["Student / New grad", "0–2 years", "3–5 years", "6–10 years", "10+ years"];

const EMPTY_PROFILE = {
  fullName: "",
  email: "",
  education: "",
  degree: "",
  experienceLevel: "",
  targetRole: "",
  skills: "",
  projects: "",
  certifications: "",
  resumeFileName: "",
};

/**
 * STEP 1 — a calm, single-purpose onboarding form. Deliberately short:
 * only fields that actually personalize the interview, no giant form. The
 * resume is optional and never uploaded anywhere in this build — the
 * filename is just acknowledged in the UI for a realistic feel.
 */
function ProfileStep({ onContinue }) {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const roleOptions = getRoleOptions();

  function update(field, value) {
    setProfile((prev) => ({ ...prev, [field]: value }));
  }

  function handleResumeChange(event) {
    const file = event.target.files?.[0];
    update("resumeFileName", file ? file.name : "");
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!profile.fullName.trim() || !profile.email.trim() || !profile.targetRole) return;
    onContinue(profile);
  }

  const canContinue = profile.fullName.trim() && profile.email.trim() && profile.targetRole;

  return (
    <main className="onboarding-page">
      <StepProgress current={1} />

      <div className="onboarding-head">
        <p className="hero-label">STEP 1 OF 5</p>
        <h1>Let's get to know you</h1>
        <p className="onboarding-subtitle">
          We'll use this information to personalize your technical interview.
        </p>
      </div>

      <form className="profile-form" onSubmit={handleSubmit}>
        <div className="profile-form-grid">
          <label className="form-field">
            <span>Full name</span>
            <input
              type="text"
              value={profile.fullName}
              onChange={(e) => update("fullName", e.target.value)}
              placeholder="Jordan Rivera"
              required
            />
          </label>

          <label className="form-field">
            <span>Email</span>
            <input
              type="email"
              value={profile.email}
              onChange={(e) => update("email", e.target.value)}
              placeholder="you@example.com"
              required
            />
          </label>

          <label className="form-field">
            <span>Education</span>
            <input
              type="text"
              value={profile.education}
              onChange={(e) => update("education", e.target.value)}
              placeholder="B.Tech, XYZ University"
            />
          </label>

          <label className="form-field">
            <span>Degree / branch</span>
            <input
              type="text"
              value={profile.degree}
              onChange={(e) => update("degree", e.target.value)}
              placeholder="Computer Science"
            />
          </label>

          <label className="form-field">
            <span>Experience level</span>
            <select
              value={profile.experienceLevel}
              onChange={(e) => update("experienceLevel", e.target.value)}
            >
              <option value="">Select…</option>
              {EXPERIENCE_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>Target role</span>
            <select
              value={profile.targetRole}
              onChange={(e) => update("targetRole", e.target.value)}
              required
            >
              <option value="">Select…</option>
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field form-field-wide">
            <span>Technical skills</span>
            <input
              type="text"
              value={profile.skills}
              onChange={(e) => update("skills", e.target.value)}
              placeholder="Python, React, distributed systems…"
            />
          </label>

          <label className="form-field form-field-wide">
            <span>Projects</span>
            <textarea
              rows={3}
              value={profile.projects}
              onChange={(e) => update("projects", e.target.value)}
              placeholder="A short note on what you've built"
            />
          </label>

          <label className="form-field">
            <span>Certifications <em>(optional)</em></span>
            <input
              type="text"
              value={profile.certifications}
              onChange={(e) => update("certifications", e.target.value)}
              placeholder="AWS Certified, etc."
            />
          </label>

          <label className="form-field">
            <span>Resume <em>(optional)</em></span>
            <input type="file" accept=".pdf,.doc,.docx" onChange={handleResumeChange} />
            {profile.resumeFileName && <span className="form-hint">Attached: {profile.resumeFileName}</span>}
          </label>
        </div>

        <button type="submit" className="hero-button hero-button-large" disabled={!canContinue}>
          Continue →
        </button>
      </form>
    </main>
  );
}

export default ProfileStep;

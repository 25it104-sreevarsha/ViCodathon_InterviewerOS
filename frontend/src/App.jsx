import { useState } from "react";

import Report from "./components/Report";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Features from "./components/Features";
import Interview from "./components/Interview";
import ProfileStep from "./components/steps/ProfileStep";
import AccessibilityStep from "./components/steps/AccessibilityStep";
import DeviceCheckStep from "./components/steps/DeviceCheckStep";
import EnvironmentStep from "./components/steps/EnvironmentStep";
import { useCamera } from "./hooks/useCamera";
import { useMicStream } from "./hooks/useMicStream";
import { DEMO_CANDIDATE, matchCandidateToRole } from "./data/knownCandidates";

// "landing" | "profile" | "accessibility" | "devicecheck" | "environment" | "interview" | "report"
function App() {
  const [screen, setScreen] = useState("landing");
  const [profile, setProfile] = useState(null);
  const [accessibilityMode, setAccessibilityMode] = useState(false);
  const [candidate, setCandidate] = useState(null); // { id, name, role }
  const [feedback, setFeedback] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [integrity, setIntegrity] = useState(null);

  // Shared across the device-check, environment-check, and interview steps
  // so the candidate is only ever prompted for permission once.
  const camera = useCamera();
  const micStream = useMicStream();

  function goHome() {
    setProfile(null);
    setAccessibilityMode(false);
    setCandidate(null);
    setFeedback(null);
    setTranscript([]);
    setIntegrity(null);
    setScreen("landing");
  }

  function startRealOnboarding() {
    setScreen("profile");
  }

  function startDemo() {
    setCandidate(DEMO_CANDIDATE);
    setProfile({ fullName: DEMO_CANDIDATE.name, targetRole: DEMO_CANDIDATE.role });
    setAccessibilityMode(false);
    setScreen("interview");
  }

  function handleProfileContinue(collectedProfile) {
    setProfile(collectedProfile);
    setCandidate(matchCandidateToRole(collectedProfile.targetRole));
    setScreen("accessibility");
  }

  function handleAccessibilityContinue({ accessibilityMode: mode }) {
    setAccessibilityMode(mode);
    setScreen("devicecheck");
  }

  function handleInterviewFinished(finalFeedback, finalTranscript, finalIntegrity) {
    setFeedback(finalFeedback);
    setTranscript(finalTranscript);
    setIntegrity(finalIntegrity);
    setScreen("report");
  }

  if (screen === "profile") {
    return (
      <div className="app">
        <ProfileStep onContinue={handleProfileContinue} />
      </div>
    );
  }

  if (screen === "accessibility") {
    return (
      <div className="app">
        <AccessibilityStep onContinue={handleAccessibilityContinue} onBack={() => setScreen("profile")} />
      </div>
    );
  }

  if (screen === "devicecheck") {
    return (
      <div className="app">
        <DeviceCheckStep
          camera={camera}
          micStream={micStream}
          onContinue={() => setScreen("environment")}
          onBack={() => setScreen("accessibility")}
        />
      </div>
    );
  }

  if (screen === "environment") {
    return (
      <div className="app">
        <EnvironmentStep
          camera={camera}
          micStream={micStream}
          onContinue={() => setScreen("interview")}
          onBack={() => setScreen("devicecheck")}
        />
      </div>
    );
  }

  if (screen === "interview") {
    return (
      <div className="app app-interview">
        <Interview
          candidateId={candidate?.id || DEMO_CANDIDATE.id}
          candidateDisplayName={profile?.fullName}
          accessibilityMode={accessibilityMode}
          camera={camera}
          micStream={micStream}
          onFinish={handleInterviewFinished}
        />
      </div>
    );
  }

  if (screen === "report") {
    return (
      <div className="app">
        <Navbar onStart={startRealOnboarding} />

        <Report
          profile={profile}
          feedback={feedback}
          transcript={transcript}
          integrity={integrity}
          onRestart={goHome}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <Navbar onStart={startRealOnboarding} />

      <Hero onStart={startRealOnboarding} onDemo={startDemo} />

      <Features />
    </div>
  );
}

export default App;

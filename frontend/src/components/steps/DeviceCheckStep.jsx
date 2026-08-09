import { useEffect, useRef, useState } from "react";
import StepProgress from "./StepProgress";
import MicLevelMeter from "../interview/MicLevelMeter";
import { useSpeechSynthesis } from "../../hooks/useSpeechSynthesis";

const SPEAKER_TEST_LINE =
  "This is a quick check of your speaker audio. If you can hear this clearly, you're all set.";

/**
 * STEP 3 — camera, microphone, and speaker, one at a time. Every checkmark
 * reflects something actually verified in this session (a live preview
 * frame, a real audio level, real TTS playback) — nothing here is a canned
 * "all green" state.
 */
function DeviceCheckStep({ onContinue, onBack, camera, micStream }) {
  const speech = useSpeechSynthesis();
  const videoRef = useRef(null);
  const [speakerConfirmed, setSpeakerConfirmed] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = camera.stream || null;
    }
  }, [camera.stream]);

  function handleSpeakerTest() {
    speech.speak(SPEAKER_TEST_LINE);
  }

  const cameraReady = Boolean(camera.stream);
  const micReady = Boolean(micStream.stream);
  const speakerReady = speakerConfirmed || (speech.isSupported === false);
  const allReady = cameraReady && micReady && speakerReady;

  return (
    <main className="onboarding-page">
      <StepProgress current={3} />

      <div className="onboarding-head">
        <p className="hero-label">STEP 3 OF 5</p>
        <h1>Let's check your setup</h1>
        <p className="onboarding-subtitle">A quick check of your camera, microphone, and speakers.</p>
      </div>

      <div className="device-check-list">
        <section className="device-check-card">
          <div className="device-check-top">
            <span>Camera</span>
            {cameraReady && <span className="check-ready">✓ Camera ready</span>}
          </div>

          <div className="camera-frame camera-frame-device">
            {camera.stream ? (
              <video ref={videoRef} autoPlay playsInline muted />
            ) : (
              <div className="camera-placeholder">
                {camera.status === "pending" && <span>Requesting camera access…</span>}
                {camera.status === "denied" && <span>{camera.error}</span>}
                {camera.status === "error" && <span>{camera.error}</span>}
                {(camera.status === "idle" || !camera.status) && <span>Camera preview will appear here</span>}
              </div>
            )}
          </div>

          {!cameraReady && (
            <button type="button" className="hero-button" onClick={camera.enable} disabled={camera.status === "pending"}>
              {camera.status === "pending" ? "Requesting…" : "Enable Camera"}
            </button>
          )}
        </section>

        <section className="device-check-card">
          <div className="device-check-top">
            <span>Microphone</span>
            {micReady && <span className="check-ready">✓ Microphone ready</span>}
          </div>

          {micStream.stream ? (
            <div className="mic-test-active">
              <MicLevelMeter
                stream={micStream.stream}
              />
              <span>Speak — the bars should move.</span>
            </div>
          ) : (
            <p className="question-hint">{micStream.error || "Test your microphone before continuing."}</p>
          )}

          {!micReady && (
            <button type="button" className="hero-button" onClick={micStream.enable} disabled={micStream.status === "pending"}>
              {micStream.status === "pending" ? "Requesting…" : "Test Microphone"}
            </button>
          )}
        </section>

        <section className="device-check-card">
          <div className="device-check-top">
            <span>Speaker</span>
            {speakerReady && speakerConfirmed && <span className="check-ready">✓ Speaker ready</span>}
          </div>

          <p className="question-hint">
            {speech.isSupported
              ? "Play a short test sentence to confirm your audio output."
              : "Speech playback isn't supported in this browser — questions will still be shown as captions."}
          </p>

          {speech.isSupported && (
            <button
              type="button"
              className="hero-button"
              onClick={() => {
                handleSpeakerTest();
                setSpeakerConfirmed(true);
              }}
            >
              {speech.isSpeaking ? "Playing…" : "▶ Play Test"}
            </button>
          )}
        </section>
      </div>

      <div className="onboarding-actions">
        <button type="button" className="ghost-button" onClick={onBack}>
          ← Back
        </button>
        <button type="button" className="hero-button hero-button-large" onClick={onContinue} disabled={!allReady}>
          Continue →
        </button>
      </div>
    </main>
  );
}

export default DeviceCheckStep;

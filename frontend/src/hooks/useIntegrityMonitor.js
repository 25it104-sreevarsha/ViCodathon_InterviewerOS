import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Interview Integrity Monitor.
 *
 * Records observable technical signals during the interview — never
 * conclusions. This hook does not (and cannot, with the APIs available
 * here) detect faces, count people, judge honesty, or infer emotion. It
 * only wires up things a browser can genuinely tell us:
 *
 *  - the tab was hidden / the window lost focus
 *  - fullscreen was exited (only tracked if fullscreen was requested)
 *  - the camera or microphone track ended unexpectedly (permission
 *    revoked, device unplugged, etc.)
 *  - the candidate's mic stayed near-silent for an extended stretch while
 *    the interview was actively listening for an answer
 *
 * Everything else the wider spec describes (face detection, multiple-face
 * detection, gaze tracking) is deliberately NOT implemented here: there is
 * no dependency-free, reliable browser API for it, and fabricating that
 * signal would violate the "never fabricate integrity results" requirement.
 * The event schema below has room for those signal types so a real
 * computer-vision provider could be plugged in later without changing the
 * calling code.
 *
 * Thresholds are configurable via `policy` and events never trigger an
 * automatic disqualification — only a risk level the UI can react to.
 */

const DEFAULT_POLICY = {
  warningsForMedium: 3,
  warningsForHigh: 6,
  criticalsForHigh: 1,
  criticalsForCritical: 2,
  silenceThresholdMs: 7000,
  silenceLevelFloor: 0.035,
};

const SEVERITY_WEIGHT = { info: 0, warning: 1, critical: 3 };

export function useIntegrityMonitor(policy = {}) {
  const config = { ...DEFAULT_POLICY, ...policy };
  const [events, setEvents] = useState([]);
  const fullscreenRequestedRef = useRef(false);
  const silenceStateRef = useRef();
  if (silenceStateRef.current == null) {
    silenceStateRef.current = { lastLoudAt: 0, hasFired: false, initialized: false };
  }

  const recordEvent = useCallback((type, severity, message) => {
    setEvents((prev) => [
      ...prev,
      { type, severity, message, timestamp: new Date().toISOString() },
    ]);
  }, []);

  // Tab visibility + window focus.
  useEffect(() => {
    function handleVisibility() {
      if (document.hidden) {
        recordEvent("TAB_HIDDEN", "warning", "The interview tab was switched away from.");
      }
    }
    function handleBlur() {
      if (!document.hidden) {
        recordEvent("WINDOW_BLUR", "info", "The browser window lost focus.");
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
    };
  }, [recordEvent]);

  // Fullscreen exit — only meaningful once fullscreen has actually been requested.
  useEffect(() => {
    function handleFullscreenChange() {
      if (fullscreenRequestedRef.current && !document.fullscreenElement) {
        recordEvent("FULLSCREEN_EXITED", "warning", "Fullscreen mode was exited.");
        fullscreenRequestedRef.current = false;
      }
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, [recordEvent]);

  const requestFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
      fullscreenRequestedRef.current = true;
    } catch {
      // Fullscreen isn't available/permitted — not itself an integrity event.
    }
  }, []);

  // Camera / mic track loss.
  const watchMediaStream = useCallback(
    (stream, kind) => {
      if (!stream) return () => {};
      const tracks = stream.getTracks();
      const handleEnded = () => {
        recordEvent(
          kind === "video" ? "CAMERA_LOST" : "MIC_LOST",
          "critical",
          kind === "video"
            ? "The camera stream ended unexpectedly."
            : "The microphone stream ended unexpectedly."
        );
      };
      tracks.forEach((track) => track.addEventListener("ended", handleEnded));
      return () => tracks.forEach((track) => track.removeEventListener("ended", handleEnded));
    },
    [recordEvent]
  );

  // Prolonged silence while actively listening for an answer. Caller feeds
  // real audio levels in via `noteAudioLevel`; this just tracks how long
  // the level has stayed under the floor.
  const noteAudioLevel = useCallback(
    (level, isListening) => {
      const state = silenceStateRef.current;
      if (!isListening) {
        state.initialized = false;
        state.hasFired = false;
        return;
      }
      if (!state.initialized) {
        state.lastLoudAt = Date.now();
        state.initialized = true;
        state.hasFired = false;
        return;
      }
      if (level > config.silenceLevelFloor) {
        state.lastLoudAt = Date.now();
        state.hasFired = false;
        return;
      }
      const silentFor = Date.now() - state.lastLoudAt;
      if (silentFor > config.silenceThresholdMs && !state.hasFired) {
        state.hasFired = true;
        recordEvent("PROLONGED_SILENCE", "info", "No microphone input was detected for an extended period.");
      }
    },
    [config.silenceLevelFloor, config.silenceThresholdMs, recordEvent]
  );

  const summary = useMemo(() => {
    const warnings = events.filter((e) => e.severity === "warning").length;
    const criticals = events.filter((e) => e.severity === "critical").length;
    const score = events.reduce((sum, e) => sum + SEVERITY_WEIGHT[e.severity], 0);

    let riskLevel = "clear";
    if (criticals >= config.criticalsForCritical) riskLevel = "critical";
    else if (criticals >= config.criticalsForHigh || warnings >= config.warningsForHigh) riskLevel = "high";
    else if (warnings >= config.warningsForMedium) riskLevel = "medium";
    else if (events.length > 0) riskLevel = "low";

    return { warnings, criticals, score, riskLevel, total: events.length };
  }, [
    events,
    config.criticalsForCritical,
    config.criticalsForHigh,
    config.warningsForHigh,
    config.warningsForMedium,
  ]);

  return {
    events,
    summary,
    recordEvent,
    watchMediaStream,
    noteAudioLevel,
    requestFullscreen,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Manages a raw microphone MediaStream (separate from SpeechRecognition,
 * which handles its own mic access internally). Used purely to drive real
 * audio-level visualizations — the mic test on the setup screen and the
 * waveform / avatar listening ring during the interview.
 */
export function useMicStream() {
  const isSupported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia);

  const [status, setStatus] = useState("idle"); // idle | pending | granted | denied | error
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);

  const streamRef = useRef(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const enable = useCallback(async () => {
    if (!isSupported) {
      setStatus("error");
      setError("Microphone access isn't supported in this browser.");
      return;
    }
    setStatus("pending");
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      streamRef.current = mediaStream;
      setStream(mediaStream);
      setStatus("granted");
    } catch (err) {
      stopTracks();
      setStream(null);
      setStatus(err?.name === "NotAllowedError" ? "denied" : "error");
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone permission was denied. You can still type your answers."
          : "Couldn't access your microphone. You can still type your answers."
      );
    }
  }, [isSupported, stopTracks]);

  const disable = useCallback(() => {
    stopTracks();
    setStream(null);
    setStatus("idle");
  }, [stopTracks]);

  useEffect(() => () => stopTracks(), [stopTracks]);

  return { isSupported, status, stream, error, enable, disable };
}

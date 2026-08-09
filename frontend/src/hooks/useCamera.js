import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Manages a candidate camera preview via getUserMedia.
 *
 * This is presentation only — the video stream is displayed locally in
 * <video>, never uploaded, recorded, or analyzed. No emotion detection,
 * face tracking, or scoring happens here or anywhere in the frontend.
 */
export function useCamera() {
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
      setError("Camera access isn't supported in this browser.");
      return;
    }
    setStatus("pending");
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
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
          ? "Camera permission was denied. You can still continue the interview without video."
          : "Couldn't access your camera. You can still continue the interview without video."
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

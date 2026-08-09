import { useEffect, useRef } from "react";

/**
 * Drives a real, live audio level (0–1) from a MediaStream using the Web
 * Audio API, and reports it via `onLevel` on every animation frame.
 *
 * Deliberately does NOT put the level in React state — at ~60fps that would
 * cause a re-render storm. Instead callers write the value straight onto a
 * DOM node's CSS custom property (see AIAvatar / MicLevelMeter), which is
 * cheap and keeps the visualization smooth.
 */
export function useAudioLevel(stream, onLevel) {
  const onLevelRef = useRef(onLevel);

  useEffect(() => {
    onLevelRef.current = onLevel;
  }, [onLevel]);

  useEffect(() => {
    if (!stream) {
      onLevelRef.current?.(0);
      return;
    }

    const AudioContextImpl = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextImpl) return;

    const audioContext = new AudioContextImpl();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    const buffer = new Uint8Array(analyser.frequencyBinCount);
    let frameId;

    const tick = () => {
      analyser.getByteFrequencyData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) {
        sum += buffer[i];
      }
      const average = sum / buffer.length / 255; // 0–1
      onLevelRef.current?.(Math.min(1, average * 1.6));
      frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(frameId);
      source.disconnect();
      analyser.disconnect();
      audioContext.close().catch(() => {});
      onLevelRef.current?.(0);
    };
  }, [stream]);
}

import { useEffect, useRef } from "react";
import { useAudioLevel } from "./useAudioLevel";

/**
 * Watches real microphone levels while `active` and fires `onSilence` once
 * the candidate has said something and then gone quiet for `silenceMs`.
 *
 * Deliberately conservative: it only arms once real speech has been heard
 * (so it never fires on the quiet moment right after the question is
 * asked), and it only fires once per "active" window — the caller resets
 * that window by toggling `active` off and back on for the next answer.
 * This avoids submitting on a candidate's normal thinking pause.
 */
export function useSilenceAutoSubmit({ active, stream, hasSpeech, silenceMs = 2600, levelFloor = 0.045, onSilence }) {
  const stateRef = useRef({ lastLoudAt: 0, armed: false, fired: false });
  const onSilenceRef = useRef(onSilence);
  const hasSpeechRef = useRef(hasSpeech);

  useEffect(() => {
    onSilenceRef.current = onSilence;
  }, [onSilence]);

  useEffect(() => {
    hasSpeechRef.current = hasSpeech;
  }, [hasSpeech]);

  useEffect(() => {
    if (!active) {
      stateRef.current = { lastLoudAt: 0, armed: false, fired: false };
    }
  }, [active]);

  useAudioLevel(active ? stream : null, (level) => {
    if (!active) return;
    const state = stateRef.current;
    const now = Date.now();

    if (level > levelFloor) {
      state.lastLoudAt = now;
      state.armed = true; // real speech has been heard at least once
      return;
    }

    if (!state.armed || state.fired) return;
    if (!hasSpeechRef.current) return; // nothing transcribed yet — don't fire

    if (state.lastLoudAt && now - state.lastLoudAt > silenceMs) {
      state.fired = true;
      onSilenceRef.current?.();
    }
  });
}

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Reusable text-to-speech hook wrapping the browser SpeechSynthesis API.
 *
 * - speak(text, { onEnd }) queues an utterance and reports isSpeaking.
 * - mute()/unmute() silence future speech; the caller's flow still advances
 *   because onEnd still fires (just without audio) — muting shouldn't stall
 *   the interview.
 * - replay() re-speaks the last utterance.
 * - Falls back gracefully (isSupported: false) when SpeechSynthesis isn't
 *   available, so callers can just show the text instead.
 *
 * Voice selection: browsers load their voice list asynchronously — on the
 * very first utterance of a page load, `getVoices()` often returns an empty
 * array (the real list only arrives once the `voiceschanged` event fires),
 * so picking a voice too early silently falls back to the browser's
 * platform default, which is inconsistent across OSes and sometimes male.
 * To keep the interviewer's voice consistent, this hook (a) waits for the
 * voice list to actually be populated before the first utterance, and
 * (b) picks a female-sounding voice by name once and reuses that exact
 * voice for every subsequent utterance, rather than re-picking each time.
 */

// Common female voice names across Chrome/Edge/Safari/Firefox on
// Windows/macOS/Android. The Web Speech API doesn't expose a standardized
// gender field, so matching by name is the only reliable cross-browser way.
const FEMALE_VOICE_HINTS = [
  "female",
  "samantha", // macOS / iOS default
  "victoria",
  "karen", // Australian English (macOS)
  "moira", // Irish English (macOS)
  "tessa", // South African English (macOS)
  "fiona",
  "zira", // Windows default
  "hazel", // Windows UK
  "susan",
  "aria", // Microsoft Edge neural
  "jenny", // Microsoft Edge neural
  "michelle",
  "joanna", // Amazon Polly (shows up in some Edge builds)
  "salli",
  "kimberly",
  "kendra",
  "ivy",
  "amy",
  "emma",
  "eva",
  "sara",
  "google us english", // Chrome's default US voice is female
  "google uk english female",
];

function isLikelyFemale(voice) {
  const name = voice.name.toLowerCase();
  return FEMALE_VOICE_HINTS.some((hint) => name.includes(hint));
}

function waitForVoices() {
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (voices) => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", handleChange);
      resolve(voices);
    };
    const handleChange = () => finish(window.speechSynthesis.getVoices());

    window.speechSynthesis.addEventListener("voiceschanged", handleChange);
    // Safety net: some browsers never fire voiceschanged (or already had the
    // list ready but getVoices() raced it) — don't block speech forever.
    setTimeout(() => finish(window.speechSynthesis.getVoices()), 1000);
  });
}

export function useSpeechSynthesis() {
  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const lastTextRef = useRef("");
  const onEndRef = useRef(null);
  const isMutedRef = useRef(false);
  // Picked once and reused for every utterance, so the interviewer's voice
  // never changes mid-interview even if getVoices() reorders results later.
  const chosenVoiceRef = useRef(null);
  const voicesReadyRef = useRef(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    return () => {
      if (isSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, [isSupported]);

  const ensureVoiceChosen = useCallback(async () => {
    if (!isSupported) return null;
    if (chosenVoiceRef.current) return chosenVoiceRef.current;

    if (!voicesReadyRef.current) {
      voicesReadyRef.current = waitForVoices();
    }
    const voices = await voicesReadyRef.current;
    if (!voices.length) return null;

    const englishVoices = voices.filter((v) => /^en/i.test(v.lang));
    const pool = englishVoices.length ? englishVoices : voices;

    const picked =
      pool.find(isLikelyFemale) ||
      voices.find(isLikelyFemale) ||
      pool[0] ||
      voices[0];

    chosenVoiceRef.current = picked;
    return picked;
  }, [isSupported]);

  const speak = useCallback(
    (text, { onEnd, onBoundary } = {}) => {
      lastTextRef.current = text;
      onEndRef.current = onEnd || null;

      if (!isSupported) {
        // No TTS available at all — resolve immediately so the interview
        // flow (avatar state, listening step) can still proceed.
        onEndRef.current?.();
        return;
      }

      if (isMutedRef.current) {
        // Respect mute, but don't stall the conversation.
        setIsSpeaking(false);
        onEndRef.current?.();
        return;
      }

      ensureVoiceChosen().then((voice) => {
        // Muted (or cancelled) while we were waiting on the voice list.
        if (isMutedRef.current) {
          setIsSpeaking(false);
          onEndRef.current?.();
          return;
        }

        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        if (voice) utterance.voice = voice;
        utterance.rate = 1;
        utterance.pitch = 1;

        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => {
          setIsSpeaking(false);
          onEndRef.current?.();
        };
        utterance.onerror = () => {
          setIsSpeaking(false);
          onEndRef.current?.();
        };
        if (onBoundary) {
          utterance.onboundary = (event) => {
            if (event.name === "word" || event.name === undefined) {
              onBoundary();
            }
          };
        }

        window.speechSynthesis.speak(utterance);
      });
    },
    [isSupported, ensureVoiceChosen]
  );

  const cancel = useCallback(() => {
    if (isSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  const replay = useCallback(() => {
    if (lastTextRef.current) speak(lastTextRef.current);
  }, [speak]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next && isSupported) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
      return next;
    });
  }, [isSupported]);

  return { isSupported, isSpeaking, isMuted, speak, cancel, replay, toggleMute };
}
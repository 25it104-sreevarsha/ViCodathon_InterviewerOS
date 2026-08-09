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
 */
export function useSpeechSynthesis() {
  const isSupported =
    typeof window !== "undefined" && "speechSynthesis" in window;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const lastTextRef = useRef("");
  const onEndRef = useRef(null);
  const isMutedRef = useRef(false);

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

  const pickVoice = useCallback(() => {
    if (!isSupported) return null;
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;
    return (
      voices.find((v) => /en/i.test(v.lang) && /Google|Natural|Premium/i.test(v.name)) ||
      voices.find((v) => /en/i.test(v.lang)) ||
      voices[0]
    );
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

      window.speechSynthesis.cancel();

      if (isMutedRef.current) {
        // Respect mute, but don't stall the conversation.
        setIsSpeaking(false);
        onEndRef.current?.();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      const voice = pickVoice();
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
      // Word-boundary events give a rough, honest approximation of speech
      // timing to drive mouth movement — this is NOT phoneme-level lip-sync,
      // just "something moves roughly when a word is spoken". A future
      // viseme/phoneme provider could replace this callback without
      // touching the avatar component's public API.
      if (onBoundary) {
        utterance.onboundary = (event) => {
          if (event.name === "word" || event.name === undefined) {
            onBoundary();
          }
        };
      }

      window.speechSynthesis.speak(utterance);
    },
    [isSupported, pickVoice]
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

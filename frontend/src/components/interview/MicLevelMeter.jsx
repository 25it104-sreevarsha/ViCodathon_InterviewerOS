import { useRef } from "react";
import { useAudioLevel } from "../../hooks/useAudioLevel";

/**
 * A small live waveform driven by a real microphone level (not a canned
 * animation). Used both for the "microphone test" on the setup screen and
 * for the answer panel's listening visualization.
 */
function MicLevelMeter({ stream, bars = 9 }) {
  const wrapRef = useRef(null);

  useAudioLevel(stream, (level) => {
    if (wrapRef.current) {
      wrapRef.current.style.setProperty("--level", level.toFixed(3));
    }
  });

  return (
    <div className="mic-meter" ref={wrapRef}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="mic-meter-bar"
          style={{ "--i": i, "--n": bars }}
        />
      ))}
    </div>
  );
}

export default MicLevelMeter;

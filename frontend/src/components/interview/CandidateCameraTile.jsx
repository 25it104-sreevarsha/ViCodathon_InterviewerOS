import { useEffect, useRef } from "react";

/**
 * The candidate's self-view, styled as a small floating video-call tile in
 * the lower-right corner. Purely presentational — the stream never leaves
 * the browser and nothing here analyzes it.
 */
function CandidateCameraTile({ camera, listening }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = camera.stream || null;
    }
  }, [camera.stream]);

  return (
    <div className={`camera-tile ${listening ? "is-listening" : ""}`}>
      {camera.stream ? (
        <video ref={videoRef} autoPlay playsInline muted />
      ) : (
        <div className="camera-tile-placeholder">
          <span>Camera off</span>
        </div>
      )}
      <span className="camera-tile-label">You</span>
    </div>
  );
}

export default CandidateCameraTile;

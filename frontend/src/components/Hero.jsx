function Hero({ onStart, onDemo }) {
  return (
    <main className="hero">
      <p className="hero-label">
        AI TECHNICAL INTERVIEWER
      </p>

      <h1>
        Your technical interview
        <br />
        starts here.
      </h1>

      <p className="hero-description">
        An adaptive interviewer that understands
        what you learned and how you reason.
      </p>

      <div className="hero-actions">
        <button className="hero-button" onClick={onStart}>
          Start Your Interview →
        </button>

        <button className="ghost-button" onClick={onDemo}>
          Try Demo Interview
        </button>
      </div>

      <p className="hero-demo-note">
        The demo runs the full experience instantly with a sample candidate — no setup required.
      </p>
    </main>
  );
}

export default Hero;

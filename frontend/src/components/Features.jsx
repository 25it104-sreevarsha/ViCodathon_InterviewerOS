function Features() {
  return (
    <section className="features">
      <div className="features-heading">
        <h2>More than a question generator.</h2>

        <p>
          Interviewer OS adapts to the candidate
          instead of following a fixed script.
        </p>
      </div>

      <div className="feature-grid">
        <article className="feature-card">
          <span>01</span>

          <h3>Context-aware</h3>

          <p>
            Understands the candidate's learning journey,
            previous answers, and evaluated topics.
          </p>
        </article>

        <article className="feature-card">
          <span>02</span>

          <h3>Adaptive</h3>

          <p>
            Strong answers lead to deeper questions.
            Weak answers trigger targeted follow-ups.
          </p>
        </article>

        <article className="feature-card">
          <span>03</span>

          <h3>Evidence-based</h3>

          <p>
            Generates structured feedback based on
            what the candidate demonstrated.
          </p>
        </article>
      </div>
    </section>
  );
}

export default Features;
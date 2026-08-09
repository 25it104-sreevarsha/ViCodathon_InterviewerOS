import { useRef, useState } from "react";

// Pairs up the interviewer/candidate transcript into
// { questionNumber, question, answer } rows for the evidence list — purely
// a presentation reshape of what was already exchanged during the
// interview, not new content.
const INTEGRITY_LABELS = {
  TAB_HIDDEN: "Tab switched away",
  WINDOW_BLUR: "Window lost focus",
  FULLSCREEN_EXITED: "Fullscreen exited",
  CAMERA_LOST: "Camera disconnected",
  MIC_LOST: "Microphone disconnected",
  PROLONGED_SILENCE: "Extended silence",
};

function pairTranscript(transcript) {
  const pairs = [];
  let pendingQuestion = null;

  transcript.forEach((turn) => {
    if (turn.role === "interviewer") {
      pendingQuestion = turn.text;
    } else if (turn.role === "candidate" && pendingQuestion) {
      pairs.push({
        questionNumber: pairs.length + 1,
        question: pendingQuestion,
        answer: turn.text,
      });
      pendingQuestion = null;
    }
  });

  return pairs;
}

function initials(name) {
  if (!name) return "AI";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function Report({ profile, feedback, transcript, integrity, onRestart }) {
  const reportRef = useRef(null);
  const [isExporting, setIsExporting] = useState(false);

  const exchanges = pairTranscript(transcript ?? []);
  const strengthCount = feedback?.strengths?.length ?? 0;
  const gapCount = feedback?.gaps?.length ?? 0;
  const coverageTotal = Math.max(strengthCount + gapCount, 1);
  const strengthPct = Math.round((strengthCount / coverageTotal) * 100);

  async function handleDownloadPdf() {
    if (!reportRef.current || isExporting) return;
    setIsExporting(true);
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const canvas = await html2canvas(reportRef.current, {
        backgroundColor: "#0b0c11",
        scale: 2,
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const fileName = `${(profile?.fullName || "candidate").replace(/\s+/g, "-").toLowerCase()}-interview-assessment.pdf`;
      pdf.save(fileName);
    } catch {
      window.print();
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <main className="report-page">
      <div className="report-actions-bar">
        <div>
          <p className="hero-label">INTERVIEW COMPLETE</p>
          <h1>Interview Assessment</h1>
        </div>

        <div className="report-actions">
          <button type="button" className="ghost-button" onClick={() => document.getElementById("report-doc")?.scrollIntoView({ behavior: "smooth" })}>
            View Assessment
          </button>
          <button type="button" className="hero-button" onClick={handleDownloadPdf} disabled={isExporting}>
            {isExporting ? "Preparing…" : "📄 Download PDF"}
          </button>
        </div>
      </div>

      <div id="report-doc" ref={reportRef} className="report-doc">
        <section className="report-hero-card">
          <div className="report-avatar-badge">{initials(profile?.fullName)}</div>
          <div>
            <h2>{profile?.fullName || "Candidate"}</h2>
            <p>{profile?.targetRole || "Technical Interview"}{profile?.experienceLevel ? ` · ${profile.experienceLevel}` : ""}</p>
            {profile?.education && <p className="report-meta-line">{profile.education}{profile?.degree ? `, ${profile.degree}` : ""}</p>}
          </div>
        </section>

        <p className="report-intro">
          {feedback?.summary || "Here's a summary of the interview responses."}
        </p>

        <section className="report-summary">
          <div className="summary-card summary-card-indigo">
            <span>QUESTIONS ANSWERED</span>
            <strong>{exchanges.length}</strong>
          </div>

          <div className="summary-card summary-card-green">
            <span>STRENGTHS IDENTIFIED</span>
            <strong>{strengthCount}</strong>
          </div>

          <div className="summary-card summary-card-amber">
            <span>KNOWLEDGE GAPS</span>
            <strong>{gapCount}</strong>
          </div>

          <div className="summary-card summary-card-slate">
            <span>STATUS</span>
            <strong>Completed</strong>
          </div>
        </section>

        {feedback && (strengthCount > 0 || gapCount > 0) && (
          <section className="coverage-panel">
            <span className="panel-eyebrow">RESPONSE COVERAGE</span>
            <div className="coverage-bar">
              <div className="coverage-bar-strengths" style={{ width: `${strengthPct}%` }} />
              <div className="coverage-bar-gaps" style={{ width: `${100 - strengthPct}%` }} />
            </div>
            <div className="coverage-legend">
              <span><i className="dot dot-strength" />{strengthCount} strength{strengthCount === 1 ? "" : "s"}</span>
              <span><i className="dot dot-gap" />{gapCount} gap{gapCount === 1 ? "" : "s"}</span>
            </div>
          </section>
        )}

        {feedback && (
          <section className="feedback-section">
            <div className="feedback-block feedback-block-green">
              <h2>✓ Strengths</h2>
              {feedback.strengths?.length ? (
                <ul className="feedback-list">
                  {feedback.strengths.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="report-intro">No standout strengths recorded.</p>
              )}
            </div>

            <div className="feedback-block feedback-block-amber">
              <h2>△ Knowledge Gaps</h2>
              {feedback.gaps?.length ? (
                <ul className="feedback-list">
                  {feedback.gaps.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="report-intro">No significant gaps identified.</p>
              )}
            </div>

            <div className="feedback-block feedback-block-indigo">
              <h2>→ Recommended Next Steps</h2>
              {feedback.next?.length ? (
                <ul className="feedback-list">
                  {feedback.next.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              ) : (
                <p className="report-intro">No specific next steps suggested.</p>
              )}
            </div>
          </section>
        )}

        {!feedback && (
          <section className="feedback-section">
            <p className="report-intro">
              The interview ended before a full assessment could be generated. The evidence below
              reflects everything that was answered.
            </p>
          </section>
        )}

        {integrity && (
          <section className="coverage-panel">
            <span className="panel-eyebrow">🔒 INTERVIEW INTEGRITY</span>

            {integrity.summary.total === 0 ? (
              <ul className="feedback-list integrity-summary-list">
                <li>✓ Camera and microphone remained connected</li>
                <li>✓ No tab, window, or fullscreen interruptions detected</li>
                <li>✓ No integrity events recorded</li>
              </ul>
            ) : (
              <>
                <p className="report-intro" style={{ marginTop: 12 }}>
                  {integrity.summary.riskLevel === "low"
                    ? `${integrity.summary.total} minor interruption${integrity.summary.total === 1 ? "" : "s"} detected — no review needed.`
                    : `Integrity review recommended — ${integrity.summary.warnings} interruption${integrity.summary.warnings === 1 ? "" : "s"} and ${integrity.summary.criticals} device issue${integrity.summary.criticals === 1 ? "" : "s"} detected.`}
                </p>
                <ul className="feedback-list">
                  {integrity.events.map((event, index) => (
                    <li key={index}>
                      {INTEGRITY_LABELS[event.type] || event.type} — {new Date(event.timestamp).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        <section className="answers-list">
          <h2>Interview Evidence</h2>

          {exchanges.length === 0 ? (
            <p className="report-intro">No answers were recorded.</p>
          ) : (
            exchanges.map((item) => (
              <article className="answer-card" key={item.questionNumber}>
                <div className="answer-card-top">
                  <span>QUESTION {String(item.questionNumber).padStart(2, "0")}</span>
                </div>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </article>
            ))
          )}
        </section>
      </div>

      <button className="hero-button hero-button-large" onClick={onRestart}>
        Start Another Interview →
      </button>
    </main>
  );
}

export default Report;

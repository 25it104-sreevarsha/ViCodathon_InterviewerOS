// The backend's /api/interview endpoint only accepts a candidate id that
// already exists in backend/src/data/candidates.json — creating interview
// sessions for arbitrary new candidates would require changing the backend,
// which is out of scope for this redesign (see architecture rule).
//
// So real onboarding (ProfileStep) collects the candidate's own info for
// personalization — name, education, target role, skills, etc. — and this
// list is used purely to pick which existing backend record's interview
// track most closely matches the role they chose. The candidate's own
// entered name/profile is what's shown throughout the UI and on the final
// report; the backend id is only used to run the actual adaptive interview.
export const KNOWN_CANDIDATES = [
  { id: "CAND-001", name: "Sarah Johnson", role: "Senior Data Engineer" },
  { id: "CAND-002", name: "Alex Turner", role: "Backend Software Engineer" },
  { id: "CAND-003", name: "Emily Chen", role: "AI Engineer" },
  { id: "CAND-004", name: "David Miller", role: "Business Analyst" },
  { id: "CAND-005", name: "Michael Brown", role: "DevOps Engineer" },
  { id: "CAND-006", name: "Wendy Foster", role: "Marketing Manager" },
  { id: "CAND-007", name: "Ethan Brooks", role: "Computer Science Intern" },
  { id: "CAND-008", name: "Harold Whitfield", role: "Distinguished Engineer" },
  { id: "CAND-009", name: "Zara Ahmadi", role: "AI Engineer" },
  { id: "CAND-010", name: "Gerald Combs", role: "IT Support Specialist" },
  { id: "CAND-011", name: "Mia Alvarez", role: "UX Researcher" },
  { id: "CAND-012", name: "Chen Wei", role: "Mobile App Developer" },
  { id: "CAND-013", name: "Ravi Patel", role: "Software Engineer" },
  { id: "CAND-014", name: "Bethany Cole", role: "HR Manager" },
  { id: "CAND-015", name: "Noah Kim", role: "Principal Architect" },
  { id: "CAND-016", name: "Isabella Rossi", role: "Software Engineer" },
  { id: "CAND-017", name: "Tyler Brooks", role: "Junior Developer" },
  { id: "CAND-018", name: "Diane Foster", role: "AI Engineer" },
  { id: "CAND-019", name: "Frank DeLuca", role: "Legacy Systems Engineer" },
  { id: "CAND-020", name: "Priyanka Sharma", role: "Software Engineer" },
];

export const DEMO_CANDIDATE = { id: "CAND-003", name: "Emily Chen", role: "AI Engineer" };

const ROLE_OPTIONS = [...new Set(KNOWN_CANDIDATES.map((c) => c.role))].sort();

/** Distinct target-role choices for the onboarding form's dropdown. */
export function getRoleOptions() {
  return ROLE_OPTIONS;
}

/** Finds the backend candidate record whose interview track best matches
 * a chosen target role (exact match first, then loose substring match),
 * falling back to the demo candidate so the interview can always start. */
export function matchCandidateToRole(targetRole) {
  if (!targetRole) return DEMO_CANDIDATE;
  const exact = KNOWN_CANDIDATES.find(
    (c) => c.role.toLowerCase() === targetRole.toLowerCase()
  );
  if (exact) return exact;

  const needle = targetRole.toLowerCase();
  const loose = KNOWN_CANDIDATES.find(
    (c) => c.role.toLowerCase().includes(needle) || needle.includes(c.role.toLowerCase())
  );
  return loose || DEMO_CANDIDATE;
}

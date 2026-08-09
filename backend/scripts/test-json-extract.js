/**
 * Focused regression test for utils/jsonExtract.js's brace-matching
 * hardening. Run with: npm run test:json
 *
 * The audit flagged that the original implementation matched greedily from
 * the first `{` to the LAST `}` in the whole response, which over-captures
 * (and breaks JSON.parse) if the model adds trailing commentary containing
 * its own braces after the JSON object. This checks the fix without
 * changing behavior for the common well-formed case.
 */
import { extractJson } from "../src/utils/jsonExtract.js";

let failures = 0;

function check(label, fn) {
  try {
    fn();
    console.log(`  PASS  ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${label}\n        ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

console.log("jsonExtract hardening");

check("plain JSON object (no wrapper) still extracts cleanly", () => {
  const raw = '{"question":"Explain embeddings.","focusConcepts":["vectors"]}';
  const extracted = extractJson(raw);
  const parsed = JSON.parse(extracted);
  assert(parsed.question === "Explain embeddings.", "expected question field to survive extraction");
});

check("JSON wrapped in a markdown code fence still extracts cleanly", () => {
  const raw = '```json\n{"score": 8, "strengths": ["clear reasoning"]}\n```';
  const extracted = extractJson(raw);
  const parsed = JSON.parse(extracted);
  assert(parsed.score === 8, "expected score field to survive fence stripping");
});

check("realistic AI output with trailing prose containing braces no longer breaks parsing", () => {
  // This is the exact failure mode the audit flagged: the old greedy
  // `\{[\s\S]*\}` regex would match from the object's opening `{` all the
  // way to the LAST `}` in the string below (inside the trailing aside),
  // producing an invalid, unparsable blob.
  const raw =
    'Sure, here is the evaluation:\n' +
    '{"score": 7, "correctness": 7, "missingConcepts": []}\n' +
    'Let me know if you would like more detail on any part {just ask}.';
  const extracted = extractJson(raw);
  const parsed = JSON.parse(extracted); // must not throw
  assert(parsed.score === 7, "expected score field to survive extraction past trailing prose");
});

check("JSON containing a brace-like character inside a string value still parses", () => {
  const raw = '{"question": "What does the { symbol mean in a JSON schema?", "score": 5}';
  const extracted = extractJson(raw);
  const parsed = JSON.parse(extracted);
  assert(parsed.question.includes("{ symbol"), "expected the in-string brace to be preserved, not treated as structural");
});

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
process.exit(failures === 0 ? 0 : 1);

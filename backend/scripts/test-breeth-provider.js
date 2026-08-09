/**
 * Unit tests for breethMemoryProvider.js itself — the real Breeth REST
 * integration, not the mock. These stub `global.fetch` so they run without
 * any network access or a real BREETH_API_KEY (task brief §18: "tests must
 * NOT require real Breeth credentials"), while still exercising the exact
 * request/response handling that talks to https://api.thebreeth.com,
 * including the two upstream error shapes documented at
 * docs.thebreeth.com/docs/api/overview (401 unauthenticated, 429
 * quota_exceeded).
 *
 * Run with: npm run test:breeth
 */
import { env } from "../src/config/env.js";
import { breethMemoryProvider } from "../src/memory/breethMemoryProvider.js";

let failures = 0;

async function check(label, fn) {
  try {
    await fn();
    console.log(`  PASS  ${label}`);
  } catch (err) {
    failures += 1;
    console.error(`  FAIL  ${label}\n        ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- fetch stubbing helpers -------------------------------------------------

const originalFetch = globalThis.fetch;
const originalApiKey = env.memory.breeth.apiKey;
const originalBaseUrl = env.memory.breeth.baseUrl;
const originalGroupPrefix = env.memory.breeth.groupPrefix;
const originalExtractIntent = env.memory.breeth.extractIntent;
const originalTimeoutMs = env.memory.breeth.timeoutMs;

function restoreEnv() {
  env.memory.breeth.apiKey = originalApiKey;
  env.memory.breeth.baseUrl = originalBaseUrl;
  env.memory.breeth.groupPrefix = originalGroupPrefix;
  env.memory.breeth.extractIntent = originalExtractIntent;
  env.memory.breeth.timeoutMs = originalTimeoutMs;
  globalThis.fetch = originalFetch;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

/** Installs a fetch stub that records every call and returns queued responses. */
function stubFetch(responder) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const parsedBody = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url, headers: init?.headers ?? {}, body: parsedBody, signal: init?.signal });
    return responder(url, parsedBody, calls.length - 1);
  };
  return calls;
}

async function main() {
  console.log("Breeth provider unit tests (mocked fetch, no real credentials/network)\n");

  console.log("Configuration");

  await check("write() throws a clear error when BREETH_API_KEY is missing", async () => {
    env.memory.breeth.apiKey = "";
    let threw = false;
    try {
      await breethMemoryProvider.write({ candidateId: "CAND-1", insight: { observation: "x" } });
    } catch (err) {
      threw = true;
      assert(err.message.includes("BREETH_API_KEY"), `expected a clear missing-key message, got: ${err.message}`);
    }
    assert(threw, "expected write() to throw without BREETH_API_KEY");
  });

  await check("search() throws a clear error when BREETH_API_KEY is missing", async () => {
    env.memory.breeth.apiKey = "";
    let threw = false;
    try {
      await breethMemoryProvider.search({ candidateId: "CAND-1", query: "anything" });
    } catch (err) {
      threw = true;
      assert(err.message.includes("BREETH_API_KEY"), `expected a clear missing-key message, got: ${err.message}`);
    }
    assert(threw, "expected search() to throw without BREETH_API_KEY");
  });

  console.log("\nSuccessful write");

  await check("write() POSTs to /v1/episodes with Bearer auth, prose content, and configured flags", async () => {
    env.memory.breeth.apiKey = "ck_live_test_key";
    env.memory.breeth.baseUrl = "https://api.thebreeth.com";
    env.memory.breeth.groupPrefix = "interviewer-os";
    env.memory.breeth.extractIntent = false;

    const calls = stubFetch((url) => {
      assert(url === "https://api.thebreeth.com/v1/episodes", `unexpected URL: ${url}`);
      return jsonResponse(200, { ok: true, episode_name: "api_123", extracted: { entities: 2, edges: 1 } });
    });

    const result = await breethMemoryProvider.write({
      candidateId: "CAND-001",
      insight: { type: "knowledge_gap", topic: "RAG chunking", observation: "Could not explain chunk-size trade-offs." },
    });

    assert(result.ok === true, "expected ok: true from a successful write");
    assert(result.id === "api_123", "expected the episode_name to be returned as id");

    const [call] = calls;
    assert(call.headers.Authorization === "Bearer ck_live_test_key", "expected Bearer auth header with the configured key");
    assert(call.headers["Content-Type"] === "application/json", "expected JSON content type");
    assert(call.body.content.includes("Could not explain chunk-size trade-offs."), "expected the observation folded into episode content");
    assert(call.body.content.includes("CAND-001"), "expected the candidate id folded into episode content");
    assert(call.body.extract_intent === false, "expected extract_intent to follow BREETH_EXTRACT_INTENT (false)");
    assert(typeof call.body.group_id === "string" && call.body.group_id.length > 0, "expected a group_id on the write");
  });

  console.log("\nCandidate isolation (group_id)");

  await check("write() scopes different candidates to different, prefixed group_ids", async () => {
    env.memory.breeth.apiKey = "ck_live_test_key";
    env.memory.breeth.groupPrefix = "interviewer-os";

    const calls = stubFetch(() => jsonResponse(200, { ok: true, episode_name: "api_1" }));

    await breethMemoryProvider.write({ candidateId: "CAND-001", insight: { observation: "a" } });
    await breethMemoryProvider.write({ candidateId: "CAND-002", insight: { observation: "b" } });

    const [groupA, groupB] = calls.map((c) => c.body.group_id);
    assert(groupA !== groupB, `expected different candidates to get different group_ids, got the same: ${groupA}`);
    assert(groupA.startsWith("interviewer-os-"), `expected group_id to carry the configured prefix, got: ${groupA}`);
    assert(groupA.includes("CAND-001") && groupB.includes("CAND-002"), "expected each group_id to encode its own candidate id");
  });

  await check("write() sanitizes a candidate id with invalid group_id characters", async () => {
    env.memory.breeth.apiKey = "ck_live_test_key";
    const calls = stubFetch(() => jsonResponse(200, { ok: true, episode_name: "api_1" }));

    await breethMemoryProvider.write({ candidateId: "cand/weird id!", insight: { observation: "a" } });

    const groupId = calls[0].body.group_id;
    assert(/^[a-zA-Z0-9_-]+$/.test(groupId), `expected only letters/digits/dashes/underscores in group_id, got: ${groupId}`);
  });

  console.log("\nSuccessful search / retrieval");

  await check("search() POSTs to /v1/search and maps edges into normalized results", async () => {
    env.memory.breeth.apiKey = "ck_live_test_key";
    stubFetch((url) => {
      assert(url === "https://api.thebreeth.com/v1/search", `unexpected URL: ${url}`);
      return jsonResponse(200, {
        edges: [
          {
            fact: "Candidate struggled to explain chunk-size trade-offs.",
            source_node: "RAG chunking",
            intent_meta: { edge_kind: "knowledge_gap" },
          },
        ],
      });
    });

    const { results } = await breethMemoryProvider.search({ candidateId: "CAND-001", query: "chunking trade-offs" });
    assert(results.length === 1, "expected one mapped result");
    assert(results[0].observation.includes("chunk-size"), "expected fact -> observation mapping");
    assert(results[0].topic === "RAG chunking", "expected source_node -> topic mapping");
    assert(results[0].type === "knowledge_gap", "expected intent_meta.edge_kind -> type mapping");
  });

  await check("getCandidateContext() builds a topic-aware query and a typed summary", async () => {
    env.memory.breeth.apiKey = "ck_live_test_key";
    const calls = stubFetch(() =>
      jsonResponse(200, {
        edges: [{ fact: "Explained retrieval clearly.", source_node: "RAG", intent_meta: { edge_kind: "strength" } }],
      })
    );

    const context = await breethMemoryProvider.getCandidateContext({ candidateId: "CAND-001", topic: "RAG" });
    assert(calls[0].body.query.includes("RAG"), "expected the topic folded into the search query");
    assert(context.summary?.includes("[strength]"), "expected the summary to tag the insight type");
    assert(context.insights.length === 1, "expected one insight in the context");
  });

  console.log("\nUpstream error handling (401 / 429)");

  await check("a 401 unauthenticated response throws a clear, status-carrying error", async () => {
    env.memory.breeth.apiKey = "ck_live_bad_key";
    stubFetch(() => jsonResponse(401, { error: "unauthenticated", message: "Bearer token missing / invalid / expired" }));

    let threw = false;
    try {
      await breethMemoryProvider.write({ candidateId: "CAND-001", insight: { observation: "x" } });
    } catch (err) {
      threw = true;
      assert(err.message.includes("401"), `expected the error to carry the HTTP status, got: ${err.message}`);
      assert(err.message.includes("unauthenticated"), `expected the error to carry Breeth's slug, got: ${err.message}`);
    }
    assert(threw, "expected write() to throw on a 401 response");
  });

  await check("a 429 quota_exceeded response throws a clear, status-carrying error", async () => {
    env.memory.breeth.apiKey = "ck_live_test_key";
    stubFetch(() =>
      jsonResponse(429, { error: "quota_exceeded", message: "Monthly retrievals cap reached.", kind: "retrievals" })
    );

    let threw = false;
    try {
      await breethMemoryProvider.search({ candidateId: "CAND-001", query: "anything" });
    } catch (err) {
      threw = true;
      assert(err.message.includes("429"), `expected the error to carry the HTTP status, got: ${err.message}`);
      assert(err.message.includes("quota_exceeded"), `expected the error to carry Breeth's slug, got: ${err.message}`);
    }
    assert(threw, "expected search() to throw on a 429 response");
  });

  console.log("\nNetwork / timeout failure");

  await check("a network failure (fetch rejects) surfaces as a clear wrapped error", async () => {
    env.memory.breeth.apiKey = "ck_live_test_key";
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };

    let threw = false;
    try {
      await breethMemoryProvider.write({ candidateId: "CAND-001", insight: { observation: "x" } });
    } catch (err) {
      threw = true;
      assert(err.message.includes("failed"), `expected a wrapped network-failure message, got: ${err.message}`);
    }
    assert(threw, "expected write() to throw on a network failure");
  });

  await check("a request exceeding BREETH_TIMEOUT_MS is aborted and reported as a timeout", async () => {
    env.memory.breeth.apiKey = "ck_live_test_key";
    env.memory.breeth.timeoutMs = 20;
    globalThis.fetch = (url, init) =>
      new Promise((_, reject) => {
        init.signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });

    let threw = false;
    try {
      await breethMemoryProvider.write({ candidateId: "CAND-001", insight: { observation: "x" } });
    } catch (err) {
      threw = true;
      assert(err.message.toLowerCase().includes("timed out"), `expected a timeout-specific message, got: ${err.message}`);
    } finally {
      env.memory.breeth.timeoutMs = originalTimeoutMs;
    }
    assert(threw, "expected write() to throw when the request times out");
  });

  console.log("\nHealth check (GET /health/memory support)");

  await check("healthCheck() reports not reachable, with no live call, when unconfigured", async () => {
    env.memory.breeth.apiKey = "";
    let fetchCalled = false;
    globalThis.fetch = async () => {
      fetchCalled = true;
      return jsonResponse(200, {});
    };

    const result = await breethMemoryProvider.healthCheck();
    assert(result.reachable === false, "expected reachable: false without a configured key");
    assert(!fetchCalled, "expected healthCheck() to skip the network call entirely when unconfigured");
  });

  await check("healthCheck() reports reachable: true on a successful probe", async () => {
    env.memory.breeth.apiKey = "ck_live_test_key";
    stubFetch(() => jsonResponse(200, { edges: [] }));

    const result = await breethMemoryProvider.healthCheck();
    assert(result.reachable === true, "expected reachable: true on a successful probe");
  });

  await check("healthCheck() reports reachable: false with a safe, generic message on upstream failure", async () => {
    env.memory.breeth.apiKey = "ck_live_bad_key";
    stubFetch(() => jsonResponse(401, { error: "unauthenticated", message: "Bearer token missing / invalid / expired" }));

    const result = await breethMemoryProvider.healthCheck();
    assert(result.reachable === false, "expected reachable: false on a failed probe");
    assert(!result.error.includes("ck_live_bad_key"), "expected the health check to never leak the API key");
  });

  restoreEnv();

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  restoreEnv();
  console.error("Unexpected top-level failure:", err);
  process.exit(1);
});

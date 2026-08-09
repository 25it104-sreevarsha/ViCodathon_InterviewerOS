import { config as loadEnv } from "dotenv";

// Why: load .env once, at import time, before anything else reads process.env.
loadEnv();

export const env = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv: process.env.NODE_ENV || "development",

  // CORS config for the HTTP API layer (src/api). "*" (default) allows any
  // origin, which is fine for a hackathon demo; set a specific origin (or a
  // comma-separated list) in production. Only server.js reads this.
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
  },

  // AI provider config for the interview intelligence engine.
  // Centralized here (rather than reading process.env in every AI-related
  // file) so services/ai/aiProvider.js is the only thing that needs to know
  // where configuration comes from. Names match the placeholders already
  // reserved in .env.example (AI_PROVIDER / AI_API_KEY, plus the
  // Groq-specific GROQ_API_KEY / GROQ_MODEL below).
  ai: {
    // "mock" (default, no key needed), "anthropic", or "groq" (real model calls).
    provider: process.env.AI_PROVIDER || "mock",
    apiKey: process.env.AI_API_KEY || "",
    model: process.env.AI_MODEL || "claude-sonnet-4-6",
    // Separate credentials/model for the Groq provider (distinct env vars
    // per the request that added it, rather than overloading AI_API_KEY).
    groq: {
      apiKey: process.env.GROQ_API_KEY || "",
      model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    },
  },

  // Memory provider config for the Breeth-backed candidate memory layer.
  // Same centralization reasoning as `ai` above — memory/memoryProvider.js
  // is the only thing that reads this.
  memory: {
    // "mock" (default, no key needed, deterministic — what tests always
    // run against) or "breeth" (real Breeth REST API calls).
    provider: process.env.MEMORY_PROVIDER || "mock",
    breeth: {
      apiKey: process.env.BREETH_API_KEY || "",
      baseUrl: process.env.BREETH_BASE_URL || "https://api.thebreeth.com",
      // Prefixes every Breeth group_id so this app's candidate namespaces
      // can't collide with anything else using the same Breeth project.
      groupPrefix: process.env.BREETH_GROUP_PREFIX || "interviewer-os",
      // Whether writes ask Breeth to run intent annotation (costs a
      // monthly intent credit per write). Off by default to conserve a
      // hackathon-tier quota; the insight is still stored either way.
      extractIntent: process.env.BREETH_EXTRACT_INTENT === "true",
      timeoutMs: Number(process.env.BREETH_TIMEOUT_MS) || 8000,
    },
  },
};

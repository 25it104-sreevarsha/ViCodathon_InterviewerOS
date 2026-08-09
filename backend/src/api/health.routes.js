import { Router } from "express";
import { curriculumService } from "../curriculum/curriculum.service.js";
import { candidatesService } from "../candidates/candidates.service.js";
import { memoryProvider } from "../memory/memoryProvider.js";

export const healthRouter = Router();

/**
 * GET /health
 * Reports whether the server is up and whether both data files load and
 * validate. Why check the data layer here: if curriculum.json or
 * candidates.json is missing/malformed, we want that visible immediately
 * rather than surfacing as a confusing 500 on the first real request.
 */
healthRouter.get("/health", (req, res) => {
  const curriculumOk = curriculumService.isAvailable();
  const candidatesOk = candidatesService.isAvailable();
  const allOk = curriculumOk && candidatesOk;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    server: "running",
    dataLayer: {
      curriculum: curriculumOk ? "available" : "unavailable",
      candidates: candidatesOk ? "available" : "unavailable",
    },
    timestamp: new Date().toISOString(),
  });
});

// Why a separate, cached endpoint rather than folding this into GET /health:
// a Breeth reachability probe costs one retrieval against the monthly quota
// (unlimited on Pro, capped on Hobby/Starter/Growth — see
// docs.thebreeth.com/docs/tiers-and-limits). GET /health is meant to be
// cheap and pollable (e.g. by a load balancer); this one is a manual,
// server-side diagnostic the frontend is never expected to call, and its
// result is cached briefly so repeated calls don't re-spend quota.
const MEMORY_HEALTH_CACHE_MS = 30_000;
let memoryHealthCache = null; // { at: number, payload: object }

/**
 * GET /health/memory
 * Reports which memory provider is active and whether it's usable, without
 * ever exposing the API key or raw upstream error detail. For MEMORY_PROVIDER=mock
 * this is a free, instant, always-"ok" check (no network). For
 * MEMORY_PROVIDER=breeth this checks BREETH_API_KEY is configured and, if so,
 * makes one lightweight Breeth call (cached — see above) to confirm reachability.
 */
healthRouter.get("/health/memory", async (req, res) => {
  const provider = memoryProvider.name();

  if (provider === "mock") {
    return res.status(200).json({ provider, status: "ok", mode: "mock (no credentials, deterministic)" });
  }

  const now = Date.now();
  if (memoryHealthCache && now - memoryHealthCache.at < MEMORY_HEALTH_CACHE_MS) {
    return res.status(memoryHealthCache.status).json({ ...memoryHealthCache.payload, cached: true });
  }

  const { reachable, error } = await memoryProvider.healthCheck();
  const status = reachable ? 200 : 503;
  const payload = {
    provider,
    status: reachable ? "ok" : error === "BREETH_API_KEY is not configured." ? "not_configured" : "unreachable",
    ...(error ? { detail: error } : {}),
  };

  memoryHealthCache = { at: now, status, payload };
  res.status(status).json(payload);
});

import express from "express";
import { fileURLToPath } from "node:url";
import cors from "cors";
import { env } from "./config/env.js";
import { healthRouter } from "./api/health.routes.js";
import { interviewRouter } from "./api/interview.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();

// CORS: the frontend lives on a different origin. env.cors.origin defaults
// to "*" (fine for a hackathon demo); set CORS_ORIGIN to a specific origin
// (or a comma-separated list) in production. No auth is required by the
// hackathon spec, so this is intentionally the only cross-origin control.
const corsOrigin = env.cors.origin;
app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin.split(",").map((o) => o.trim()),
  })
);

app.use(express.json());

app.use(healthRouter);
app.use(interviewRouter);

app.use(notFoundHandler);
app.use(errorHandler);

// Only start listening when this file is run directly (`node src/server.js`
// / `npm start`), not when it's imported (e.g. by the HTTP integration
// tests in scripts/test-http-api.js) — importing the app must not also bind
// a port.
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  app.listen(env.port, () => {
    console.log(`Interviewer OS backend listening on http://localhost:${env.port}`);
    console.log(`Environment: ${env.nodeEnv}`);
  });
}

export { app };

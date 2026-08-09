import { AppError } from "../utils/errors.js";

/**
 * Central error handler. Why: every route would otherwise need its own
 * try/catch-and-format logic. Routes/services just throw AppError subclasses
 * (or let unexpected errors propagate) and this converts them into a
 * consistent JSON shape with the right status code.
 */
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  // express.json() throws a body-parser SyntaxError for malformed JSON
  // bodies (status 400, expose: true). Treat that as a client validation
  // error, not an internal server error — never let raw parser output leak.
  if (err.type === "entity.parse.failed" || (err instanceof SyntaxError && err.status === 400 && "body" in err)) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body must be valid JSON.",
      },
    });
  }

  // Unexpected/unclassified error — log full detail server-side, but don't
  // leak internals to the client.
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on the server.",
    },
  });
}

/** Catches requests to routes that don't exist. */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: "ROUTE_NOT_FOUND",
      message: `No route matches ${req.method} ${req.originalUrl}.`,
    },
  });
}

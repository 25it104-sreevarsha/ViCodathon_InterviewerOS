/**
 * Custom error types.
 *
 * Why: the API layer needs to tell "your JSON file is broken" (500, our fault)
 * apart from "that candidate ID doesn't exist" (404, caller's fault). Plain
 * Error objects don't carry that distinction, so we attach a statusCode and
 * a stable `code` string that a frontend can branch on.
 */

export class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR") {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** The requested resource (candidate, curriculum day, etc.) does not exist. */
export class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404, "NOT_FOUND");
  }
}

/** The caller passed a bad parameter (wrong type, empty, malformed shape). */
export class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

/** A data file is missing or its contents don't match the expected shape. */
export class DataLoadError extends AppError {
  constructor(message) {
    super(message, 500, "DATA_LOAD_ERROR");
  }
}

/**
 * Wraps an async Express route handler so a rejected promise (a thrown
 * AppError, a failed AI/memory call, anything) is forwarded to `next(err)`
 * instead of becoming an unhandled rejection. Express 4 does not do this
 * automatically for async handlers.
 */
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

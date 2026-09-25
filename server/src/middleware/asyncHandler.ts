import { Request, Response, NextFunction, RequestHandler } from 'express';
import { HttpError } from './HttpError';

/**
 * Wraps an async route handler so it can't crash the process or leave a
 * request hanging.
 *
 * - Errors deliberately thrown as `HttpError` (business rules: "not found",
 *   "already registered", etc.) pass through untouched, status and message
 *   as thrown.
 * - Anything else (an unexpected exception — a DB hiccup, a bug) is logged
 *   and converted into a 500 with `fallbackMessage`, so each route keeps
 *   exactly the specific error text it had before this wrapper existed,
 *   instead of every unexpected failure collapsing into one generic
 *   message.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
  fallbackMessage?: string
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      if (error instanceof HttpError || !fallbackMessage) {
        next(error);
        return;
      }
      console.error(fallbackMessage, error);
      next(new HttpError(500, fallbackMessage));
    });
  };
}

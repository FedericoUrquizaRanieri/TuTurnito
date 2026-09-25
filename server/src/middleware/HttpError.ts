/**
 * An error with an HTTP status code and a public-facing message, meant to be
 * thrown from inside a route/service and caught by the centralized error
 * handler in index.ts. Lets routes keep their existing per-case error text
 * without each one needing its own try/catch/res.status(...) boilerplate.
 */
export class HttpError extends Error {
  statusCode: number;
  publicMessage: string;

  constructor(statusCode: number, publicMessage: string) {
    super(publicMessage);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.publicMessage = publicMessage;
  }
}

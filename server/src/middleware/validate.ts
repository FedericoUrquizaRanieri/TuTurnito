import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodSchema } from 'zod';

/**
 * Parses `req.body` against `schema`; on failure responds 400 with the
 * first zod error message (same shape every route already used inline).
 * On success, replaces `req.body` with the parsed data so downstream
 * handlers get zod's defaults/coercions applied, not the raw input.
 */
export function validate(schema: ZodSchema): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }
    req.body = parsed.data;
    next();
  };
}

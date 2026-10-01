import { Request, Response, NextFunction } from 'express';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Cloudflare Turnstile check for sign-up and login: scripts can't create
 * accounts in bulk, while people almost never see a challenge. The web sends
 * the widget's token as `cf-turnstile-response` in the body. Without
 * TURNSTILE_SECRET (local dev, tests) it lets everything through. Goes
 * before `validate`, which drops fields the schema doesn't know.
 */
export async function requireTurnstile(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return next();

  const token = req.body?.['cf-turnstile-response'];
  if (typeof token !== 'string' || !token) {
    return res.status(400).json({ error: 'Completá la verificación de seguridad e intentá de nuevo.' });
  }

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (req.ip) body.append('remoteip', req.ip);
    const verify = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(5000) });
    const result = (await verify.json()) as { success?: boolean };
    if (!result.success) {
      return res.status(400).json({ error: 'No pudimos verificar que no seas un robot. Recargá la página e intentá de nuevo.' });
    }
    next();
  } catch (error) {
    // Cloudflare unreachable: better to let people in than to lock everyone out.
    console.error('Turnstile verification failed:', error);
    next();
  }
}

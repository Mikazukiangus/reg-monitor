import { createHash, timingSafeEqual } from 'node:crypto';
import { Request, Response } from 'express';
import { config } from '../../runtime-config.js';

// Scheduled jobs are called by Vercel with "Authorization: Bearer <CRON_SECRET>";
// without that secret they are turned off, so nobody else can run them
export function cronAuthorized(req: Request, res: Response, what: string): boolean {
  const secret = config.digest.cronSecret;
  if (!secret) {
    res.status(503).json({ success: false, error: `CRON_SECRET is not set, so ${what} turned off` });
    return false;
  }
  if (!sameText(req.get('authorization') ?? '', `Bearer ${secret}`)) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

// Compared in constant time, so the time an answer takes says nothing about
// how much of the secret was right
const sameText = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

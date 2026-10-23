import { createHash, timingSafeEqual } from 'node:crypto';
import { Request, Response } from 'express';
import { config } from '../../runtime-config.js';
import { logger } from '../logging.js';

// A shorter secret could be guessed, so the scheduled jobs stay off until it
// is replaced (for example with the output of `openssl rand -hex 32`)
export const MIN_CRON_SECRET_LENGTH = 32;

// Why a request may not run a scheduled job, or null when it may. Without a
// secret, or with one too short, the jobs are off for everyone.
export function cronRefusal(secret: string | undefined, authorization: string, what: string): { status: number; error: string } | null {
  if (!secret) return { status: 503, error: `CRON_SECRET is not set, so ${what} turned off` };
  if (secret.length < MIN_CRON_SECRET_LENGTH) {
    return { status: 503, error: `CRON_SECRET is shorter than ${MIN_CRON_SECRET_LENGTH} characters, so ${what} turned off` };
  }
  if (!sameText(authorization, `Bearer ${secret}`)) return { status: 401, error: 'Unauthorized' };
  return null;
}

// Scheduled jobs are called by Vercel with "Authorization: Bearer <CRON_SECRET>";
// without that secret they are turned off, so nobody else can run them
export function cronAuthorized(req: Request, res: Response, what: string): boolean {
  const refusal = cronRefusal(config.digest.cronSecret, req.get('authorization') ?? '', what);
  if (!refusal) return true;
  // Why a job is turned off goes to the log only: the reply must not tell a
  // caller without the secret that it is missing or short
  if (refusal.status === 503) {
    logger.warn(`[RegSonar] ${refusal.error}${config.digest.cronSecret ? `; replace it with at least ${MIN_CRON_SECRET_LENGTH} random characters` : ''}`);
  }
  res.status(refusal.status).json({ success: false, error: refusal.status === 503 ? 'Scheduled jobs are unavailable' : refusal.error });
  return false;
}

// Compared in constant time, so the time an answer takes says nothing about
// how much of the secret was right
const sameText = (a: string, b: string) =>
  timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());

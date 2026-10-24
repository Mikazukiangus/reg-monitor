import express, { Request, Response, Router } from 'express';
import { failRequest } from '../error-tracking.js';
import { digestInfo, runDigest } from '../services/digest.js';
import { cronAuthorized } from './cron.js';
import { accepts, day, flag, queryOf } from '../validate.js';

const DIGEST = { date: day, dryRun: flag };

// The daily email digest and its rules
export function digestRoutes(): Router {
  const router = express.Router();

  // Daily email digest, run by the cron job in vercel.json. Vercel sends
  // "Authorization: Bearer <CRON_SECRET>"; without that secret nothing runs, so
  // nobody else can trigger emails. ?dryRun=1 returns the email instead of
  // sending it, and ?date=YYYY-MM-DD picks the Singapore day (default yesterday).
  router.all('/api/digest', accepts(['GET'], DIGEST), async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    if (!cronAuthorized(req, res, 'the digest is')) return;
    try {
      const { date, dryRun } = queryOf(res, DIGEST);
      const run = await runDigest({ day: date ?? null, dryRun: dryRun ?? false });
      switch (run.kind) {
        case 'dryRun':
          res.json({ success: true, sent: false, ...run.summary, matches: run.matches, html: run.html, text: run.text });
          return;
        case 'nothingToSend':
          res.json({ success: true, sent: false, reason: 'No matching notices', ...run.summary });
          return;
        case 'notConfigured':
          res.status(503).json({ success: false, error: 'RESEND_API_KEY and DIGEST_TO must be set to send the digest', ...run.summary });
          return;
        case 'sent':
          res.json({ success: true, sent: true, id: run.id, ...run.summary });
          return;
        case 'queued':
          res.status(202).json({ success: true, sent: false, queued: true, reason: run.error ?? 'Waiting to be sent', ...run.summary });
      }
    } catch (error) {
      failRequest(req, res, error, { message: 'Digest failed' });
    }
  });

  router.all('/api/digest/rules', accepts(['GET']), (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, ...digestInfo() });
  });

  return router;
}

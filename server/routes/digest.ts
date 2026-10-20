import express, { Request, Response, Router } from 'express';
import { logger } from '../../logging.js';
import { digestInfo, runDigest } from '../services/digest.js';
import { cronAuthorized } from './cron.js';

// The daily email digest and its rules
export function digestRoutes(): Router {
  const router = express.Router();

  // Daily email digest, run by the cron job in vercel.json. Vercel sends
  // "Authorization: Bearer <CRON_SECRET>"; without that secret nothing runs, so
  // nobody else can trigger emails. ?dryRun=1 returns the email instead of
  // sending it, and ?date=YYYY-MM-DD picks the Singapore day (default yesterday).
  router.get('/api/digest', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    if (!cronAuthorized(req, res, 'the digest is')) return;
    try {
      const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
      const run = await runDigest({ day: date, dryRun: req.query.dryRun === '1' });
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
      }
    } catch (error: any) {
      logger.error('[RegSonar Digest] Failed', error);
      res.status(500).json({ success: false, error: 'Digest failed' });
    }
  });

  router.get('/api/digest/rules', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, ...digestInfo() });
  });

  return router;
}

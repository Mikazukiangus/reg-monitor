import express, { Request, Response, Router } from 'express';
import { logger } from '../../logging.js';
import { config } from '../../runtime-config.js';
import { matchDigest, renderDigest, sendWithResend, singaporeDate } from '../../digest.js';
import { DIGEST_RULES } from '../../digest-rules.js';
import { collectDigestNotices } from '../ingest.js';
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
      const day = date || singaporeDate(new Date(), 1);
      const { notices, failed } = await collectDigestNotices();
      const matches = matchDigest(notices, DIGEST_RULES, day);
      const email = renderDigest(matches, day, config.digest.siteUrl, failed);
      const summary = { day, checked: notices.length, matched: matches.length, failedSources: failed, subject: email.subject };
      logger.info(`[RegSonar Digest] ${day}: ${matches.length} matching of ${notices.length} notices checked${failed.length ? `; could not read ${failed.join(', ')}` : ''}`);

      if (req.query.dryRun === '1') {
        res.json({ success: true, sent: false, ...summary, matches: matches.map(m => ({ id: m.notice.id, title: m.notice.title, rules: m.rules })), html: email.html, text: email.text });
        return;
      }
      if (matches.length === 0) {
        res.json({ success: true, sent: false, reason: 'No matching notices', ...summary });
        return;
      }
      const { apiKey, to, from } = config.digest;
      if (!apiKey || to.length === 0) {
        res.status(503).json({ success: false, error: 'RESEND_API_KEY and DIGEST_TO must be set to send the digest', ...summary });
        return;
      }
      const result = await sendWithResend({ apiKey, from, to, ...email });
      logger.info(`[RegSonar Digest] Sent ${day} digest (Resend id ${result.id})`);
      res.json({ success: true, sent: true, id: result.id, ...summary });
    } catch (error: any) {
      logger.error('[RegSonar Digest] Failed', error);
      res.status(500).json({ success: false, error: 'Digest failed' });
    }
  });

  // The digest's rules and whether sending is set up (never the address)
  router.get('/api/digest/rules', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      rules: DIGEST_RULES,
      schedule: 'Daily at about 08:00 Singapore time',
      configured: config.digest.configured
    });
  });

  return router;
}

import express, { Request, Response, Router } from 'express';
import { logger } from '../logging.js';
import { config } from '../../runtime-config.js';
import { cdnCacheControl } from '../../config.js';
import { currentFeed, endpointStatus, runScheduledCheck, scheduledCheckStatus } from '../services/feed.js';
import { cronAuthorized } from './cron.js';
import { accepts } from '../validate.js';

// The feed, endpoint status and the scheduled check
export function feedRoutes(): Router {
  const router = express.Router();

  // API Route: Get connected endpoint status and latencies
  router.all('/api/feeds/status', accepts(['GET']), async (_req: Request, res: Response) => {
    try {
      res.json({ success: true, ...await endpointStatus() });
    } catch (error: any) {
      logger.error('[RegSonar] Endpoint status failed', error);
      res.status(500).json({ success: false, error: 'Endpoint status could not be loaded' });
    }
  });

  // API Route: Trigger live sync across all connected endpoints. GET responses
  // may be served from Vercel's CDN cache (up to 5 minutes old, or older while
  // a fresh copy is fetched in the background), so a cold function never makes
  // a visitor wait; lastSync says how old the data is. POST always runs; a visitor may make only a few a minute (server/rate-limits.ts).
  router.all('/api/feeds/sync', accepts(['GET', 'POST']), async (req: Request, res: Response) => {
    try {
      const feed = await currentFeed();
      res.set('Cache-Control', req.method === 'GET' ? cdnCacheControl(config.cdn.sync) : 'no-store');
      res.json({ success: true, ...feed });
    } catch (error: any) {
      logger.error('[RegSonar Feed Sentinel] Sync failed', error);
      res.status(500).json({ success: false, error: 'Feed sync failed' });
    }
  });

  // Persisted scheduled-check metadata; reading this never triggers a poll.
  router.all('/api/feeds/checks', accepts(['GET']), async (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    try {
      res.json(logger.redact({ success: true, ...await scheduledCheckStatus() }));
    } catch (error) {
      logger.error('[RegSonar History] Scheduled-check status failed', error);
      res.status(503).json({ success: false, error: 'Scheduled check history is unavailable' });
    }
  });

  // Scheduled check of every source, run by the cron jobs in vercel.json
  // several times a day (needs CRON_SECRET, like the digest). It stores up to
  // 20 items per source in the history, reading further back when there is a
  // gap, adds key points a few documents at a time, and refreshes the cached feed.
  router.all('/api/feeds/poll', accepts(['GET']), async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    if (!cronAuthorized(req, res, 'scheduled checks are')) return;
    try {
      res.json({ success: true, ...await runScheduledCheck() });
    } catch (error: any) {
      logger.error('[RegSonar Poll] Failed', error);
      res.status(500).json({ success: false, error: 'Scheduled check failed' });
    }
  });

  return router;
}

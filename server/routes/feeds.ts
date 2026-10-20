import express, { Request, Response, Router } from 'express';
import { logger } from '../logging.js';
import { config } from '../../runtime-config.js';
import { rateLimit } from '../throttle.js';
import { cdnCacheControl } from '../../config.js';
import { currentFeed, endpointStatus, runScheduledCheck, scheduledCheckStatus } from '../services/feed.js';
import { cronAuthorized } from './cron.js';

// Refreshes each visitor may ask for per minute
export const refreshLimit = rateLimit(config.refresh.limit, config.refresh.windowMs);

// The visitor's IP address. On Vercel, X-Forwarded-For is set by Vercel (a
// value sent by the client is replaced); elsewhere the connection's address.
export function visitorIp(req: Request): string {
  const forwarded = config.runtime.isVercel ? req.get('x-forwarded-for')?.split(',')[0].trim() : undefined;
  return forwarded || req.socket.remoteAddress || 'unknown';
}

// The feed, endpoint status and the scheduled check
export function feedRoutes(): Router {
  const router = express.Router();

  // API Route: Get connected endpoint status and latencies
  router.get('/api/feeds/status', async (_req: Request, res: Response) => {
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
  // a visitor wait; lastSync says how old the data is. POST always runs.
  router.all('/api/feeds/sync', async (req: Request, res: Response) => {
    // A refresh (POST) skips the CDN cache, so each visitor may ask for only a few a minute
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const wait = refreshLimit(visitorIp(req));
      if (wait) {
        res.set({ 'Cache-Control': 'no-store', 'Retry-After': String(wait) });
        res.status(429).json({ success: false, error: `Too many refreshes. Try again in ${wait} seconds.` });
        return;
      }
    }
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
  router.get('/api/feeds/checks', async (_req: Request, res: Response) => {
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
  router.get('/api/feeds/poll', async (req: Request, res: Response) => {
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

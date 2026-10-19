import express, { Request, Response, Router } from 'express';
import { logger } from '../../logging.js';
import { config } from '../../runtime-config.js';
import { rateLimit, reuseFor } from '../../src/lib/throttle.js';
import { SOURCES } from '../sources/index.js';
import { getEndpointsHealth } from '../health.js';
import { refreshSource } from '../ingest.js';
import { withHistory } from '../history.js';
import { cdnCacheControl } from '../../config.js';
import { openStore } from '../store.js';
import { pollSources } from '../ingest.js';
import { cronAuthorized } from './cron.js';

// The feed, built at most once a minute per server instance and shared by
// every request in between. Sources are re-read at most every 10 minutes
// anyway; this stops refreshes from re-reading the history database each time.
const SYNC_REUSE_MS = config.ingestion.syncReuseMs;
export const currentSync = reuseFor(SYNC_REUSE_MS, async () => {
  logger.info('[RegSonar Feed Sentinel] Querying live regulatory sources...');
  const [states, endpoints] = await Promise.all([
    Promise.all(SOURCES.map(refreshSource)),
    getEndpointsHealth()
  ]);
  const sources = SOURCES.map((s, i) => ({
    endpointId: s.endpointId,
    name: s.name,
    ok: !states[i].error,
    count: states[i].notices.length,
    lastSuccessAt: states[i].lastSuccessAt,
    error: states[i].error
  }));
  const { notices, archive } = await withHistory(states.flatMap(st => st.notices));
  return { success: true, count: notices.length, lastSync: new Date().toISOString(), notices, archive, sources, endpoints };
});

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
      const metrics = await getEndpointsHealth();
      res.json({
        success: true,
        lastChecked: new Date().toISOString(),
        totalEndpoints: metrics.length,
        operationalCount: metrics.filter(m => m.status === 'Operational').length,
        endpoints: metrics
      });
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
      const body = await currentSync();
      res.set('Cache-Control', req.method === 'GET' ? cdnCacheControl(config.cdn.sync) : 'no-store');
      res.json(body);
    } catch (error: any) {
      logger.error('[RegSonar Feed Sentinel] Sync failed', error);
      res.status(500).json({ success: false, error: 'Feed sync failed' });
    }
  });

  // Persisted scheduled-check metadata; reading this never triggers a poll.
  router.get('/api/feeds/checks', async (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    try {
      const store = await openStore();
      res.json(logger.redact(store ? { success: true, enabled: true, ...await store.checkStatus() } : { success: true, enabled: false }));
    } catch (error) {
      logger.error('[RegSonar History] Scheduled-check status failed', error);
      res.status(503).json({ success: false, error: 'Scheduled check history is unavailable' });
    }
  });

  // Scheduled check of every source, run by the cron jobs in vercel.json
  // several times a day (needs CRON_SECRET, like the digest). It stores up to
  // 20 items per source in the history, reading further back when there is a
  // gap, and adds key points a few documents at a time. Then it asks for the
  // public feed so the cached copy visitors get is refreshed too.
  router.get('/api/feeds/poll', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    if (!cronAuthorized(req, res, 'scheduled checks are')) return;
    try {
      const { results, failed, pageDatesFound } = await pollSources();
      const added = results.reduce((sum, r) => sum + r.added, 0);
      logger.info(`[RegSonar Poll] ${added} new notices from ${results.length} sources${failed.length ? `; could not read ${failed.map(f => f.name).join(', ')}` : ''}`);
      const warmed = await fetch(`${config.digest.siteUrl}/api/feeds/sync`, { signal: AbortSignal.timeout(config.polling.warmTimeoutMs) })
        .then(r => r.ok)
        .catch(() => false);
      res.json({
        success: true,
        added,
        pageDatesFound,
        feedRefreshed: warmed,
        sources: results.map(({ notices, ...r }) => r),
        failed
      });
    } catch (error: any) {
      logger.error('[RegSonar Poll] Failed', error);
      res.status(500).json({ success: false, error: 'Scheduled check failed' });
    }
  });

  return router;
}

import express, { Request, Response, Router } from 'express';
import { logger } from '../../logging.js';
import { config } from '../../runtime-config.js';
import { cdnCacheControl } from '../../config.js';
import { openStore } from '../store.js';
import { dedupeByDocument } from '../../src/lib/dedupe.js';
import { fromArchive } from '../history.js';

// Notices from the history: search, and lookup by id
export function noticeRoutes(): Router {
  const router = express.Router();

  // Search the history: titles, summaries and key points
  router.get('/api/notices/search', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    if (q.length < 2) {
      res.status(400).json({ success: false, error: 'Search needs at least 2 characters' });
      return;
    }
    try {
      const store = await openStore();
      if (!store) {
        res.json({ success: true, enabled: false, notices: [] });
        return;
      }
      const found = dedupeByDocument((await store.search(q, 40)).map(fromArchive));
      res.set('Cache-Control', cdnCacheControl(config.cdn.search));
      res.json({ success: true, enabled: true, notices: found });
    } catch (error: any) {
      logger.error('[RegSonar History] Search failed', error);
      res.status(500).json({ success: false, error: 'Search failed' });
    }
  });

  // Look up exact archived IDs for shared links and saved notices.
  router.get('/api/notices/by-id', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    let ids: unknown;
    try { ids = JSON.parse(typeof req.query.ids === 'string' ? req.query.ids : 'null'); } catch { ids = null; }
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 ||
        !ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 240)) {
      res.status(400).json({ success: false, error: 'Provide 1 to 50 notice IDs' });
      return;
    }
    try {
      const store = await openStore();
      const found = store ? await store.byIds(ids) : new Map();
      res.json({ success: true, enabled: !!store, notices: [...found.values()].map(fromArchive) });
    } catch (error) {
      logger.error('[RegSonar History] Notice lookup failed', error);
      res.status(503).json({ success: false, error: 'Notice history is unavailable' });
    }
  });

  return router;
}

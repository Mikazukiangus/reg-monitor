import express, { Request, Response, Router } from 'express';
import { logger } from '../logging.js';
import { config } from '../../runtime-config.js';
import { cdnCacheControl } from '../../config.js';
import { MAX_SEARCH_PAGE, noticesByIds, searchNotices } from '../services/notices.js';
import { accepts, cursor, idList, integer, queryOf, text } from '../validate.js';

// q: the search; cursor: an earlier page's nextCursor, for the page after it
const SEARCH = { q: text(2, 200, true), cursor, limit: integer(1, MAX_SEARCH_PAGE) };
const BY_ID = { ids: idList(50, true) };

// Notices from the history: search, and lookup by id
export function noticeRoutes(): Router {
  const router = express.Router();

  // Search the history: titles, summaries and key points, a page at a time
  router.all('/api/notices/search', accepts(['GET'], SEARCH), async (_req: Request, res: Response) => {
    const { q, cursor: after, limit } = queryOf(res, SEARCH);
    try {
      const result = await searchNotices(q!, undefined, { limit, after });
      if (result.enabled) res.set('Cache-Control', cdnCacheControl(config.cdn.search));
      res.json({ success: true, ...result });
    } catch (error: any) {
      logger.error('[RegSonar History] Search failed', error);
      res.status(500).json({ success: false, error: 'Search failed' });
    }
  });

  // Look up exact archived IDs for shared links and saved notices.
  router.all('/api/notices/by-id', accepts(['GET'], BY_ID), async (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    try {
      res.json({ success: true, ...await noticesByIds(queryOf(res, BY_ID).ids!) });
    } catch (error) {
      logger.error('[RegSonar History] Notice lookup failed', error);
      res.status(503).json({ success: false, error: 'Notice history is unavailable' });
    }
  });

  return router;
}

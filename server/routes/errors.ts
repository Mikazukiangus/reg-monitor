import express, { Request, Response, Router } from 'express';
import { browserReport, captureBrowserError, failRequest } from '../error-tracking.js';
import { errorOccurrence, recentErrorKinds } from '../services/errors.js';
import { cronAuthorized } from './cron.js';
import { accepts, integer, queryOf, type Param } from '../validate.js';

// A reference shown to a visitor (server/error-tracking.ts)
const reference: Param<string> = {
  parse: raw => (/^[\dA-F]{10}$/i.test(raw) ? raw.toUpperCase() : undefined),
  describe: 'a reference of 10 letters and digits'
};
// reference: one occurrence; otherwise the kinds seen in the last `hours`
const LIST = { reference, hours: integer(1, 2160), limit: integer(1, 200) };
// What a page may send as one report, at most
const REPORT_BYTES = '8kb';

// Error tracking: reports from visitors' browsers, and reading what was recorded
export function errorRoutes(): Router {
  const router = express.Router();

  // GET: the errors recorded (needs CRON_SECRET, like the scheduled jobs).
  // POST: an error in a visitor's browser (src/lib/errorReporting.ts); the
  // reply has the reference the page shows.
  router.all('/api/errors', accepts(['GET', 'POST'], LIST, { jsonBody: true }), express.json({ limit: REPORT_BYTES }),
    async (req: Request, res: Response) => {
      res.set('Cache-Control', 'no-store');
      if (req.method === 'POST') {
        const report = browserReport(req.body);
        if (!report || Object.keys(req.query).length) {
          res.status(400).json({ success: false, error: 'Not an error report' });
          return;
        }
        res.json({ success: true, reference: captureBrowserError(report) });
        return;
      }
      if (!cronAuthorized(req, res, 'error tracking is')) return;
      try {
        const { reference: wanted, hours = 24, limit = 50 } = queryOf(res, LIST);
        const unavailable = () => res.status(503).json({ success: false, error: 'Error tracking needs the history database' });
        if (wanted) {
          const found = await errorOccurrence(wanted);
          if (!found.enabled) unavailable();
          else if (!found.occurrence) res.status(404).json({ success: false, error: 'No error has this reference' });
          else res.json({ success: true, reference: wanted, ...found.occurrence });
          return;
        }
        const found = await recentErrorKinds(hours, limit);
        if (!found.enabled) unavailable();
        else res.json({ success: true, hours, kinds: found.kinds });
      } catch (error) {
        failRequest(req, res, error, { status: 503, message: 'Error tracking is unavailable' });
      }
    });

  return router;
}

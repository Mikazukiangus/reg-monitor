import express, { Request, Response, NextFunction } from 'express';
import { logger } from './logging.js';
import { failRequest } from './error-tracking.js';
import { feedRoutes } from './routes/feeds.js';
import { digestRoutes } from './routes/digest.js';
import { noticeRoutes } from './routes/notices.js';
import { errorRoutes } from './routes/errors.js';
import { accepts } from './validate.js';
import { originPolicy } from './cors.js';
import { apiRateLimits } from './rate-limits.js';
import { config } from '../runtime-config.js';

// API routes only. Used by the local server (server.ts) and by the Vercel
// function in api/index.ts, where the frontend is served as static files.
export function createApp() {
  const app = express();
  // Don't announce the server software
  app.disable('x-powered-by');
  // Query values are text, or a list when a name is repeated; never objects
  // built from names such as a[b]=c. No route reads a request body, so none is
  // parsed (server/validate.ts refuses one).
  app.set('query parser', 'simple');
  // Only the site's own page, and origins listed in CORS_ALLOWED_ORIGINS, may
  // call the API from a browser (server/cors.ts)
  app.use('/api', originPolicy(config.cors.allowedOrigins));
  // How often each visitor may call each route (server/rate-limits.ts)
  app.use('/api', apiRateLimits());

  // Health probe route
  app.all('/api/health', accepts(['GET']), (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'RegSonar Ingestion Gateway & Sentinel',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  app.use(feedRoutes());
  app.use(digestRoutes());
  app.use(noticeRoutes());
  app.use(errorRoutes());

  // Any other API address
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  // Express's default development error handler can echo parser messages and
  // stacks (including request content). Always return a controlled JSON error;
  // an unexpected one is captured (server/error-tracking.ts) and its
  // reference returned.
  app.use((error: any, req: Request, res: Response, next: NextFunction) => {
    const status = [400, 413, 415].includes(error?.status) ? error.status : 500;
    if (status >= 500) {
      const sent = res.headersSent;
      failRequest(req, res, error, { message: 'Internal server error' });
      if (sent) next(new Error('Internal server error'));
      return;
    }
    logger.warn('[RegSonar] Request rejected', { status });
    if (res.headersSent) { next(new Error('Internal server error')); return; }
    res.status(status).json({ success: false, error: status === 400 ? 'Invalid request body' : status === 413 ? 'Request body too large' : 'Unsupported request encoding' });
  });

  return app;
}

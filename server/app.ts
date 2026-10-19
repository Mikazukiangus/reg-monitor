import express, { Request, Response, NextFunction } from 'express';
import { logger } from '../logging.js';
import { feedRoutes } from './routes/feeds.js';
import { digestRoutes } from './routes/digest.js';
import { noticeRoutes } from './routes/notices.js';

// API routes only. Used by the local server (server.ts) and by the Vercel
// function in api/index.ts, where the frontend is served as static files.
export function createApp() {
  const app = express();
  // Don't announce the server software
  app.disable('x-powered-by');

  app.use(express.json());

  // Health probe route
  app.get('/api/health', (_req: Request, res: Response) => {
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

  // Express's default development error handler can echo parser messages and
  // stacks (including request content). Always return a controlled JSON error.
  app.use((error: any, _req: Request, res: Response, next: NextFunction) => {
    const status = [400, 413, 415].includes(error?.status) ? error.status : 500;
    if (status < 500) logger.warn('[RegSonar] Request rejected', { status });
    else logger.error('[RegSonar] Request failed', error);
    if (res.headersSent) { next(new Error('Internal server error')); return; }
    res.status(status).json({ success: false, error: status === 400 ? 'Invalid request body' : status === 413 ? 'Request body too large' : status === 415 ? 'Unsupported request encoding' : 'Internal server error' });
  });

  return app;
}

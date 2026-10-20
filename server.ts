import express, { Request, Response } from 'express';
import { logger } from './server/logging.js';
import { config } from './runtime-config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp } from './server/app.js';

// The API, for the Vercel function in api/index.ts and the tests
export { createApp };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startLocalServer() {
  const app = createApp();
  const { port, host, isProduction } = config.runtime;

  // Mount Vite or Static Serving
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, host, () => {
    logger.info(`[RegSonar] Server running on ${host}:${port}`);
  });
}

// On Vercel the app is imported by api/index.ts instead of listening on a
// port; tests import this file too, so it only listens when run directly
const runDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (!config.runtime.isVercel && runDirectly) {
  startLocalServer().catch((err) => {
    logger.error('[RegSonar] Fatal error starting server:', err);
    process.exit(1);
  });
}

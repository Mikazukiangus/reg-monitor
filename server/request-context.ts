// Sets the log context (server/log-context.ts) for each API request: an id,
// the method and path (never the query string, which may hold a search), and
// the visitor's hashed key. On Vercel the id is Vercel's own (x-vercel-id),
// which finds the request in the dashboard's logs.
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { withLogContext } from './log-context.js';
import { visitorKeys } from './rate-limits.js';

export function requestContext(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const id = req.get('x-vercel-id')?.slice(0, 120) || randomUUID();
    withLogContext({ request: { id, method: req.method, path: req.baseUrl + req.path }, visitor: visitorKeys(req)[0] }, next);
  };
}

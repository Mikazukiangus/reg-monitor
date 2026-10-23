// How often each visitor (IP address) may call each API route, checked before
// the route runs. Routes that reach the database or regulator sites get tighter
// limits; the rest are generous, as a whole office may share one address.
// Every limit is counted in this instance's memory. The tighter ones (`shared`)
// are also counted in the history database, across every instance: on Vercel
// a visitor's requests may reach several instances, each of which would
// otherwise allow the full limit. The memory count comes first, so a flood on
// one instance is turned away without writing to the database; if the database
// cannot be reached, the memory count still applies. The Vercel Firewall rule
// in HOW_IT_WORKS.md counts every route before the CDN cache.
// Replies served from Vercel's CDN cache never reach this code.
import { createHash } from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../runtime-config.js';
import { logger } from './logging.js';
import { rateLimit } from './throttle.js';
import { CircuitOpenError } from './breaker.js';
import { openStore, type NoticeStore } from './store.js';

const MINUTE = 60_000;

interface Limit {
  name: string;
  applies: (method: string, path: string) => boolean;
  limit: number;
  windowMs: number;
  // Also counted across instances, in the history database
  shared?: boolean;
  // What the visitor is told, with the seconds to wait
  message: (wait: number) => string;
}

const tooMany = (wait: number) => `Too many requests. Try again in ${wait} seconds.`;

// The first that applies counts the request
export const LIMITS: readonly Limit[] = [
  // A refresh skips the CDN cache and may read every source
  { name: 'refresh', applies: (method, path) => path === '/api/feeds/sync' && method === 'POST',
    limit: config.refresh.limit, windowMs: config.refresh.windowMs, shared: true, message: wait => `Too many refreshes. Try again in ${wait} seconds.` },
  // Scheduled jobs need the cron secret; this slows down guessing it
  { name: 'scheduled', applies: (_m, path) => path === '/api/feeds/poll' || path === '/api/digest',
    limit: 10, windowMs: MINUTE, shared: true, message: tooMany },
  // Database reads (search is debounced in the page; by-id takes 50 ids a request)
  { name: 'search', applies: (_m, path) => path === '/api/notices/search', limit: 30, windowMs: MINUTE, shared: true, message: tooMany },
  { name: 'by-id', applies: (_m, path) => path === '/api/notices/by-id', limit: 30, windowMs: MINUTE, shared: true, message: tooMany },
  // May check all regulator sites when the shared checks are over 5 minutes old
  { name: 'status', applies: (_m, path) => path === '/api/feeds/status', limit: 30, windowMs: MINUTE, shared: true, message: tooMany },
  // Everything else: the cached feed, health, checks, rules and unknown addresses
  { name: 'api', applies: () => true, limit: 120, windowMs: MINUTE, message: tooMany }
];

// The visitor's IP address. On Vercel, X-Forwarded-For is set by Vercel (a
// value sent by the client is replaced); elsewhere the connection's address.
export function visitorIp(req: Request): string {
  const forwarded = config.runtime.isVercel ? req.get('x-forwarded-for')?.split(',')[0].trim() : undefined;
  return forwarded || req.socket.remoteAddress || 'unknown';
}

// What a request is counted under: its IP address, hashed so the database
// never holds the address itself. There are no accounts; once there is a
// sign-in, the account is a second key here, and a request over the limit on
// either is refused.
export function visitorKeys(req: Request): string[] {
  return [`ip:${createHash('sha256').update(visitorIp(req)).digest('base64url').slice(0, 22)}`];
}

// The seconds to wait when any key is over the limit across instances, else 0
async function sharedWait(limit: Limit, keys: string[], store: NoticeStore | null): Promise<number> {
  if (!store) return 0;
  const counts = await Promise.all(keys.map(key => store.countHit(`${limit.name}/${key}`, limit.windowMs)));
  const over = counts.filter(c => c.hits > limit.limit);
  return over.length ? Math.max(...over.map(c => Math.max(1, Math.ceil(c.resetInMs / 1000)))) : 0;
}

export function apiRateLimits(limits: readonly Limit[] = LIMITS, storeArg: () => Promise<NoticeStore | null> = openStore): RequestHandler {
  const counters = limits.map(l => ({ ...l, take: rateLimit(l.limit, l.windowMs) }));
  return async (req: Request, res: Response, next: NextFunction) => {
    const path = req.baseUrl + req.path;
    const counter = counters.find(c => c.applies(req.method, path))!;
    const keys = visitorKeys(req);
    let wait = Math.max(...keys.map(key => counter.take(key)));
    if (!wait && counter.shared) {
      try {
        wait = await sharedWait(counter, keys, await storeArg());
      } catch (err: any) {
        // Counted in memory only until the database answers again
        if (!(err instanceof CircuitOpenError)) logger.warn('[RegSonar Rate limits] Could not count across instances', err);
      }
    }
    if (wait) {
      res.set({ 'Cache-Control': 'no-store', 'Retry-After': String(wait) });
      res.status(429).json({ success: false, error: counter.message(wait) });
      return;
    }
    next();
  };
}

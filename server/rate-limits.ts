// How often each visitor (IP address) may call each API route, checked before
// the route runs. Routes that reach the database or regulator sites get tighter
// limits; the rest are generous, as a whole office may share one address.
// Counted in memory, so on Vercel each running instance counts on its own;
// the Vercel Firewall rule in HOW_IT_WORKS.md counts across all of them.
// Replies served from Vercel's CDN cache never reach this code.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { config } from '../runtime-config.js';
import { rateLimit } from './throttle.js';

const MINUTE = 60_000;

interface Limit {
  name: string;
  applies: (method: string, path: string) => boolean;
  limit: number;
  windowMs: number;
  // What the visitor is told, with the seconds to wait
  message: (wait: number) => string;
}

const tooMany = (wait: number) => `Too many requests. Try again in ${wait} seconds.`;

// The first that applies counts the request
export const LIMITS: readonly Limit[] = [
  // A refresh skips the CDN cache and may read every source
  { name: 'refresh', applies: (method, path) => path === '/api/feeds/sync' && method === 'POST',
    limit: config.refresh.limit, windowMs: config.refresh.windowMs, message: wait => `Too many refreshes. Try again in ${wait} seconds.` },
  // Scheduled jobs need the cron secret; this slows down guessing it
  { name: 'scheduled', applies: (_m, path) => path === '/api/feeds/poll' || path === '/api/digest',
    limit: 10, windowMs: MINUTE, message: tooMany },
  // Database reads (search is debounced in the page; by-id takes 50 ids a request)
  { name: 'search', applies: (_m, path) => path === '/api/notices/search', limit: 30, windowMs: MINUTE, message: tooMany },
  { name: 'by-id', applies: (_m, path) => path === '/api/notices/by-id', limit: 30, windowMs: MINUTE, message: tooMany },
  // May check all regulator sites when this instance's copy is over 5 minutes old
  { name: 'status', applies: (_m, path) => path === '/api/feeds/status', limit: 30, windowMs: MINUTE, message: tooMany },
  // Everything else: the cached feed, health, checks, rules and unknown addresses
  { name: 'api', applies: () => true, limit: 120, windowMs: MINUTE, message: tooMany }
];

// The visitor's IP address. On Vercel, X-Forwarded-For is set by Vercel (a
// value sent by the client is replaced); elsewhere the connection's address.
export function visitorIp(req: Request): string {
  const forwarded = config.runtime.isVercel ? req.get('x-forwarded-for')?.split(',')[0].trim() : undefined;
  return forwarded || req.socket.remoteAddress || 'unknown';
}

export function apiRateLimits(limits: readonly Limit[] = LIMITS): RequestHandler {
  const counters = limits.map(l => ({ ...l, take: rateLimit(l.limit, l.windowMs) }));
  return (req: Request, res: Response, next: NextFunction) => {
    const path = req.baseUrl + req.path;
    const counter = counters.find(c => c.applies(req.method, path))!;
    const wait = counter.take(visitorIp(req));
    if (wait) {
      res.set({ 'Cache-Control': 'no-store', 'Retry-After': String(wait) });
      res.status(429).json({ success: false, error: counter.message(wait) });
      return;
    }
    next();
  };
}

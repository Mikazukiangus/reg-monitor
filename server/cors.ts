// Which pages may call the API from a browser. The site's own page is on the
// same origin as /api (Vercel serves both; locally Express serves Vite), so
// it needs no CORS headers. Another site's page may read replies only when its
// origin is listed in CORS_ALLOWED_ORIGINS, and then without credentials and
// without custom headers, so a browser can never send the cron secret. Any
// other origin is refused before the route runs. Requests without an Origin
// header (Vercel's cron jobs, curl, a same-origin GET) are not affected.
import type { NextFunction, Request, RequestHandler, Response } from 'express';

const METHODS = 'GET, HEAD, POST';
const PREFLIGHT_MAX_AGE = '600';

export function originPolicy(allowedOrigins: readonly string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction) => {
    // Replies differ by Origin, so Vercel's CDN keeps a copy per origin
    res.vary('Origin');
    const origin = req.get('origin');
    if (origin === undefined || sameOrigin(origin, req)) {
      next();
      return;
    }
    if (allowed.has(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      if (req.method === 'OPTIONS') {
        res.set({ 'Access-Control-Allow-Methods': METHODS, 'Access-Control-Max-Age': PREFLIGHT_MAX_AGE, 'Cache-Control': 'no-store' });
        res.status(204).end();
        return;
      }
      next();
      return;
    }
    res.set('Cache-Control', 'no-store');
    res.status(403).json({ success: false, error: 'Origin not allowed' });
  };
}

// The page's origin is the host this request was sent to (Vercel passes the
// requested host on; x-forwarded-host is set by Vercel, not by the browser)
function sameOrigin(origin: string, req: Request): boolean {
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false; // "null" (a sandboxed frame or a file) or malformed
  }
  return [req.get('host'), req.get('x-forwarded-host')].some(h => h !== undefined && h.toLowerCase() === host);
}

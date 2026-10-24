// Errors in this page, reported to the server's error tracking
// (server/error-tracking.ts) so they are seen without a visitor having to
// say. A report holds the error's name, message (redacted here and again on
// the server) and stack, where it happened, and the page's path without its
// query string or fragment. At most a few reports per page load, each kind
// of error once.
import { browserLogger } from '../../shared/logging';
import { within } from '../api/client';

const MAX_REPORTS = 5;
// The server's limits for each field (server/error-tracking.ts)
const LIMITS = { name: 100, message: 1000, stack: 4000 } as const;
const sent = new Set<string>();

// Report an error; the reference the server recorded it under, or null when
// it was not sent or not recorded
export async function reportError(error: unknown, where: string): Promise<string | null> {
  const name = (error instanceof Error ? error.name : 'Error').slice(0, LIMITS.name);
  const message = browserLogger.errorMessage(error, 'Unknown error').slice(0, LIMITS.message);
  const key = `${where}\n${name}\n${message}`;
  if (sent.has(key) || sent.size >= MAX_REPORTS) return null;
  sent.add(key);
  // Line by line: the redactor puts what it is given on one line
  const stack = error instanceof Error && typeof error.stack === 'string'
    ? error.stack.split('\n').map(line => browserLogger.redact(line) as string).join('\n') : undefined;
  try {
    const res = await fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ where, name, message, path: location.pathname.slice(0, 200), ...(stack ? { stack: stack.slice(0, LIMITS.stack) } : {}) }),
      // Sent even when the page is closing
      keepalive: true,
      signal: within(10_000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.reference === 'string' ? data.reference : null;
  } catch {
    return null;
  }
}

// Report errors nothing else caught: a script error, or a promise rejected
// with no handler. Errors in rendering are caught by ErrorBoundary.
export function reportUncaughtErrors(): void {
  window.addEventListener('error', event => {
    // A script from another site says only "Script error."; an image or
    // stylesheet that did not load has no error at all
    if (event.error) void reportError(event.error, 'window');
  });
  window.addEventListener('unhandledrejection', event => {
    void reportError(event.reason, 'promise');
  });
}

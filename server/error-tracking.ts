// Error tracking in one place. An unexpected error, whether in a route, a
// background job, a source or a check, or in a visitor's browser (reported to
// POST /api/errors), is captured here:
// - It is logged, redacted, as before.
// - It is recorded in the history database under a reference code, grouped
//   with other occurrences of the same error, with its stack and where it
//   happened.
// Visitors are told only a fixed message and the reference. The reference
// finds the occurrence at GET /api/errors, which needs CRON_SECRET.
// Messages, stacks and context pass through the log redactor before they are
// stored, and query strings and request bodies are never kept.
// Recording never throws and never delays the reply: it runs after the
// response (afterResponse), and without a database the log still has it.
import { createHash, randomBytes } from 'crypto';
import type { Request, Response } from 'express';
import { config } from '../runtime-config.js';
import { logger } from './logging.js';
import { publicError, UNEXPLAINED } from './errors.js';
import { CircuitOpenError } from './breaker.js';
import { rateLimit } from './throttle.js';
import { afterResponse } from './after-response.js';
import { openStore, type NoticeStore } from './store.js';

export interface ErrorContext {
  // What was running: a route ("GET /api/notices/search"), a job, a source
  where: string;
  source?: 'server' | 'browser';
  // More detail kept with the occurrence (redacted before it is stored)
  [detail: string]: unknown;
}

interface CaptureOptions {
  store?: () => Promise<NoticeStore | null>;
  // A browser's stack, which the error object does not carry
  stack?: string;
}

const MINUTE = 60_000;
// Recorded occurrences of one kind of error, per instance; more are logged only
export const RECORDS_PER_MINUTE = 10;
const recordable = rateLimit(RECORDS_PER_MINUTE, MINUTE, 1_000);

// Recordings still running, for tests (flushErrors)
const pending = new Set<Promise<void>>();

const ROOT = process.cwd();

// The frames of a stack ("at fn (file:1:2)" or "fn@file:1:2"), with the
// server's own directory left out of paths
function stackFrames(stack: unknown): string[] {
  if (typeof stack !== 'string') return [];
  return stack.split('\n').map(line => line.trim()).filter(line => /:\d+:\d+\)?$/.test(line)).slice(0, 12)
    .map(line => String(logger.redact(line.split(`file://${ROOT}`).join('.').split(ROOT).join('.'))).slice(0, 300));
}

// The same error says different numbers, ids and addresses each time
const pattern = (message: string) => message
  .replace(/\b[a-z][a-z\d+.-]*:\/\/\S+/gi, '<url>')
  .replace(/\b[\da-f]{8,}\b/gi, '<id>')
  .replace(/\d+/g, 'N')
  .slice(0, 300);

function errorName(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error === 'string' ? 'Error' : `Thrown ${typeof error}`;
  return String(logger.redact(name)).slice(0, 100) || 'Error';
}

// Capture an unexpected error: log it and record it. Returns the reference to
// show the visitor.
export function captureError(error: unknown, context: ErrorContext, options: CaptureOptions = {}): string {
  const reference = randomBytes(5).toString('hex').toUpperCase();
  const { where, source = 'server', ...details } = context;
  try {
    const location = String(logger.redact(where)).slice(0, 120);
    const name = errorName(error);
    const message = logger.errorMessage(error, '(no message)').slice(0, 1000);
    const frames = stackFrames(options.stack ?? (error as any)?.stack);
    // A browser's stack names minified functions in files renamed by each
    // build, so only the server's top frame (without line numbers) tells
    // kinds apart
    const top = source === 'server' ? (frames[0] ?? '').replace(/:\d+:\d+\)?$/, '') : '';
    const fingerprint = createHash('sha256').update([source, location, name, pattern(message), top].join('\n')).digest('base64url').slice(0, 22);

    logger.error(`[RegSonar Errors] ${location} failed (reference ${reference})`, error);
    if (recordable(fingerprint)) {
      logger.warn(`[RegSonar Errors] Reference ${reference} not recorded: more than ${RECORDS_PER_MINUTE} a minute of this kind`);
      return reference;
    }
    const contextValue = logger.redact({ ...details, deployment: config.runtime.deploymentId }) as Record<string, unknown>;
    const work = (async () => {
      const store = await (options.store ?? openStore)();
      if (!store) return;
      await store.recordError({
        fingerprint, source, location, name, message, stack: frames.length ? frames.join('\n') : null, reference, context: contextValue
      });
    })().catch(err => {
      // Without the database the occurrence is in the log alone
      if (!(err instanceof CircuitOpenError)) logger.warn(`[RegSonar Errors] Could not record reference ${reference}`, err);
    });
    pending.add(work);
    work.finally(() => pending.delete(work));
    afterResponse(work);
  } catch {
    // Tracking must never turn one failure into two
  }
  return reference;
}

// Wait for recordings still running (for tests)
export async function flushErrors(): Promise<void> {
  await Promise.all([...pending]);
}

// What visitors are told about a failed source, check or job (publicError).
// An error with no message written for visitors is one nobody expected (a bug
// in a parser, a database error), so it is captured too.
export function explainError(error: unknown, context: ErrorContext): string {
  const message = publicError(error);
  if (message === UNEXPLAINED) captureError(error, context);
  return message;
}

// Answer a request that failed unexpectedly: capture the error and reply
// with a fixed message and the reference, never the error itself
export function failRequest(req: Request, res: Response, error: unknown, reply: { status?: number; message: string }): void {
  const reference = captureError(error, {
    where: `${req.method} ${req.baseUrl + req.path}`,
    // Vercel's id for the request, which finds it in the runtime logs
    request: req.get('x-vercel-id')
  });
  if (res.headersSent) return;
  res.set('Cache-Control', 'no-store');
  res.status(reply.status ?? 500).json({ success: false, error: reply.message, reference });
}

// An error reported by a visitor's browser (src/lib/errorReporting.ts): the
// fields it may send and how long each may be
const REPORT_FIELDS = { where: 80, name: 100, message: 1000, stack: 4000, path: 200 } as const;
export type BrowserReport = { where: string; message: string; name?: string; stack?: string; path?: string };

// The report, or null when it is not one the page would send
export function browserReport(body: unknown): BrowserReport | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const fields = Object.entries(body);
  if (!fields.every(([key, value]) => Object.hasOwn(REPORT_FIELDS, key) && typeof value === 'string' &&
    value.length <= REPORT_FIELDS[key as keyof typeof REPORT_FIELDS])) return null;
  const report = body as BrowserReport;
  if (!report.message || !/^[\w .:/-]{1,80}$/.test(report.where ?? '')) return null;
  if (report.path !== undefined && !report.path.startsWith('/')) return null;
  return report;
}

export function captureBrowserError(report: BrowserReport): string {
  const error = Object.assign(new Error(report.message), { name: report.name || 'Error' });
  return captureError(error, {
    where: report.where,
    source: 'browser',
    // The page's path only: a query string or fragment may hold what was searched
    path: report.path?.split(/[?#]/)[0]
  }, { stack: report.stack ?? '' });
}

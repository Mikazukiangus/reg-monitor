// Trying a call again after a failure that is likely to pass: a dropped
// connection, or a service briefly unavailable. Only calls that are safe to
// repeat use this (reads, and sends that carry an idempotency key); each caller
// decides which failures count. Pauses grow threefold between tries, with
// jitter so that requests which failed together don't all retry together.
import { config } from '../runtime-config.js';
import { logger } from './logging.js';

// The pause before try `attempt` (2, 3, ...): base, then 3x, then 9x, each
// between half and one and a half times that
export const backoffMs = (attempt: number, baseMs = config.retry.baseDelayMs, random = Math.random) =>
  Math.round(baseMs * 3 ** (attempt - 2) * (0.5 + random()));

// A Retry-After header (seconds, or an HTTP date) in milliseconds
export function retryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (header.trim() !== '' && Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

// A connection that broke, or a name that briefly failed to resolve. A refused
// connection, an unknown name, a certificate error or our own time limit is
// not passing: another try would fail the same way, or overrun the limit.
const PASSING_CODES = new Set(['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET', 'UND_ERR_CLOSED']);
export function isPassingNetworkError(err: any): boolean {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return false;
  return PASSING_CODES.has(err?.cause?.code) || PASSING_CODES.has(err?.code);
}

// Why a result or error is worth another try, and how long the other side
// asked us to wait (Retry-After); undefined accepts it as final
export type Retry = { reason: string; waitMs?: number } | undefined;

export interface RetryOptions<T> {
  // Judges a result; undefined accepts it
  judge: (result: T) => Retry;
  // Judges a thrown error; undefined gives up and rethrows it
  judgeError: (err: unknown) => Retry;
  // Frees a result that is being tried again (an unread response body)
  discard?: (result: T) => void;
  attempts?: number;
  // Asked to wait longer than this, the last result is returned instead
  maxWaitMs?: number;
}

// Up to `attempts` tries of call. When the tries run out, or the wait asked
// for is too long, the last result is returned (or its error thrown).
export async function withRetry<T>(label: string, call: () => Promise<T>, options: RetryOptions<T>): Promise<T> {
  const { judge, judgeError, discard, attempts = config.retry.attempts, maxWaitMs = 5000 } = options;
  for (let attempt = 1; ; attempt++) {
    let result: T;
    try {
      result = await call();
    } catch (err) {
      const retry = attempt < attempts ? judgeError(err) : undefined;
      if (!retry || !(await pause(label, retry, attempt, attempts, maxWaitMs))) throw err;
      continue;
    }
    const retry = attempt < attempts ? judge(result) : undefined;
    if (!retry || !(await pause(label, retry, attempt, attempts, maxWaitMs))) return result;
    discard?.(result);
  }
}

// Waits before the next try; false when the wait asked for is too long
async function pause(label: string, retry: NonNullable<Retry>, attempt: number, attempts: number, maxWaitMs: number): Promise<boolean> {
  const wait = Math.max(backoffMs(attempt + 1), retry.waitMs ?? 0);
  if (wait > maxWaitMs) return false;
  logger.warn(`[RegSonar] ${label}: ${retry.reason}; trying again in ${wait} ms (try ${attempt + 1} of ${attempts})`);
  await new Promise(resolve => setTimeout(resolve, wait));
  return true;
}

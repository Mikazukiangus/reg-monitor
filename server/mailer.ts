// Sends email through Resend's API
import { randomUUID } from 'node:crypto';
import { config } from '../runtime-config.js';
import { logger } from './logging.js';
import { isPassingNetworkError, retryAfterMs, withRetry } from './retry.js';

// A send is tried again when Resend is briefly unavailable (429, 5xx), still
// working on the same send (409 concurrent_idempotent_requests), or the
// request broke or timed out. Every try carries the same Idempotency-Key, so
// Resend sends the email at most once: a repeat of a send it already made
// returns that send's result. Any other refusal (a 4xx) is final.
// `idempotencyKey`: the same for every attempt to send one email, including
// attempts in later requests (a queued send, server/queue.ts); a new one by default.
// A refusal another attempt would not change is thrown with `permanent` set.
export async function sendWithResend(options: { apiKey: string; from: string; to: readonly string[]; subject: string; html: string; text: string; idempotencyKey?: string }) {
  const idempotencyKey = options.idempotencyKey ?? `regsonar-digest/${randomUUID()}`;
  const { res, body } = await withRetry('Sending the digest through Resend', async () => {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ from: options.from, to: options.to, subject: options.subject, html: options.html, text: options.text }),
      signal: AbortSignal.timeout(config.digest.sendTimeoutMs)
    });
    return { res, body: await res.json().catch(() => ({})) };
  }, {
    judge: ({ res, body }) => {
      const passing = res.status === 429 || res.status >= 500 || (res.status === 409 && body?.name === 'concurrent_idempotent_requests');
      return passing ? { reason: `HTTP ${res.status}`, waitMs: retryAfterMs(res.headers.get('retry-after')) } : undefined;
    },
    // With the idempotency key a timed-out send is safe to try again
    judgeError: (err: any) => (err?.name === 'TimeoutError' || isPassingNetworkError(err) ? { reason: err?.name === 'TimeoutError' ? 'timed out' : String(err?.cause?.code ?? err?.code) } : undefined),
    maxWaitMs: 10_000
  });
  if (!res.ok) {
    const passing = res.status === 429 || res.status >= 500 || (res.status === 409 && body?.name === 'concurrent_idempotent_requests');
    throw Object.assign(new Error(`Resend returned HTTP ${res.status}${body?.message ? `: ${logger.errorMessage(body)}` : ''}`), { permanent: !passing });
  }
  return body as { id?: string };
}

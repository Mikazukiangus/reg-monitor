// Sends email through Resend's API
import { config } from '../runtime-config.js';
import { logger } from './logging.js';

export async function sendWithResend(options: { apiKey: string; from: string; to: readonly string[]; subject: string; html: string; text: string }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: options.from, to: options.to, subject: options.subject, html: options.html, text: options.text }),
    signal: AbortSignal.timeout(config.digest.sendTimeoutMs)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend returned HTTP ${res.status}${body?.message ? `: ${logger.errorMessage(body)}` : ''}`);
  return body as { id?: string };
}

// The daily email digest: read the sources, pick the notices published on one
// Singapore day that match the digest rules, and email them to the site owner.
import { logger } from '../logging.js';
import { config } from '../../runtime-config.js';
import type { CustomAlertRule } from '../../shared/regulatory.js';
import { DIGEST_RULES } from '../../digest-rules.js';
import { dedupeByDocument } from '../../shared/dedupe.js';
import type { NormalizedNotice } from '../notice.js';
import { SOURCES } from '../sources/index.js';
import { pollSources, refreshSource } from '../ingest.js';
import { matchDigest, singaporeDate } from '../digest/match.js';
import { renderDigest } from '../digest/email.js';
import { sendWithResend } from '../mailer.js';
import { openStore, type NoticeStore } from '../store.js';
import { DIGEST, digestJob, drainQueue } from '../queue.js';

export async function collectDigestNotices(): Promise<{ notices: NormalizedNotice[]; failed: string[] }> {
  // The feed's own refresh first, so the check reuses its key points instead
  // of reading the same documents again
  const states = await Promise.all(SOURCES.map(refreshSource));
  const { results, failed } = await pollSources();
  const byId = new Map<string, NormalizedNotice>();
  results.forEach(r => r.notices.forEach(n => byId.set(n.id, n)));
  states.forEach(st => st.notices.forEach(n => { if (n.keyPoints || !byId.has(n.id)) byId.set(n.id, n); }));
  return { notices: dedupeByDocument([...byId.values()]), failed: failed.map(f => f.name) };
}

export interface DigestSummary { day: string; checked: number; matched: number; failedSources: string[]; subject: string }

// What a run did: returned the email without sending it (a dry run), found
// nothing to send, could not send because Resend is not set up, or sent it
export type DigestRun =
  | { kind: 'dryRun'; summary: DigestSummary; matches: { id: string; title: string; rules: string[] }[]; html: string; text: string }
  | { kind: 'nothingToSend'; summary: DigestSummary }
  | { kind: 'notConfigured'; summary: DigestSummary }
  | { kind: 'sent'; summary: DigestSummary; id?: string }
  // Sending failed for now; it is tried again over the next hours (server/queue.ts)
  | { kind: 'queued'; summary: DigestSummary; error?: string };

export interface DigestDeps {
  collect: () => Promise<{ notices: NormalizedNotice[]; failed: string[] }>;
  send: typeof sendWithResend;
  rules: CustomAlertRule[];
  siteUrl: string;
  mail: { apiKey?: string; to: readonly string[]; from: string };
  // The history, whose queue sends the email; without one it is sent directly
  store?: () => Promise<NoticeStore | null>;
}

const defaultDeps = (): DigestDeps => ({
  collect: collectDigestNotices,
  send: sendWithResend,
  rules: DIGEST_RULES,
  siteUrl: config.digest.siteUrl,
  mail: config.digest,
  store: openStore
});

// How long the digest run waits for the queued send before answering
const SEND_NOW_MS = 30_000;

// `day` is a Singapore date (YYYY-MM-DD); yesterday's when not given
export async function runDigest(options: { day?: string | null; dryRun?: boolean }, deps: DigestDeps = defaultDeps()): Promise<DigestRun> {
  const day = options.day || singaporeDate(new Date(), 1);
  const { notices, failed } = await deps.collect();
  const matches = matchDigest(notices, deps.rules, day);
  const email = renderDigest(matches, day, deps.siteUrl, failed);
  const summary = { day, checked: notices.length, matched: matches.length, failedSources: failed, subject: email.subject };
  logger.info(`[RegSonar Digest] ${day}: ${matches.length} matching of ${notices.length} notices checked${failed.length ? `; could not read ${failed.join(', ')}` : ''}`);

  if (options.dryRun) {
    return { kind: 'dryRun', summary, matches: matches.map(m => ({ id: m.notice.id, title: m.notice.title, rules: m.rules })), html: email.html, text: email.text };
  }
  if (matches.length === 0) return { kind: 'nothingToSend', summary };
  const { apiKey, to, from } = deps.mail;
  if (!apiKey || to.length === 0) return { kind: 'notConfigured', summary };
  // Queued and sent now; if that fails it is tried again later, and a day's
  // digest already sent is not queued again (a repeated cron call)
  const store = await deps.store?.();
  if (store) {
    await store.enqueue([digestJob(day, email)]);
    const outcome = (await drainQueue(store, { until: Date.now() + SEND_NOW_MS, kinds: [DIGEST] })).find(o => o.key === day);
    if (outcome?.ok) return { kind: 'sent', summary, id: (outcome.result as { id?: string } | undefined)?.id };
    return { kind: 'queued', summary, error: outcome?.error ?? 'Already sent for this day, or waiting to be tried again' };
  }
  const result = await deps.send({ apiKey, from, to, ...email });
  logger.info(`[RegSonar Digest] Sent ${day} digest (Resend id ${result.id})`);
  return { kind: 'sent', summary, id: result.id };
}

// The digest's rules and whether sending is set up (never the address)
export function digestInfo() {
  return { rules: DIGEST_RULES, schedule: 'Daily at about 08:00 Singapore time', configured: config.digest.configured };
}

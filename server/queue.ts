// Background jobs: work nobody should wait for, kept in the history database
// (the jobs table, migration 6) so it outlives the request that asked for it.
// - key-points: read a notice's document and store its key points. A
//   visitor's refresh used to read every new document before answering (13 to
//   15 seconds on a new server instance); now it answers with the notices and
//   the documents are read after.
// - digest: send the day's email. A send that fails is tried again over the
//   next hours instead of the day's digest being lost.
// Jobs run after the response has been sent (afterResponse) and in every
// scheduled check, with the time it has left. Without a database there is no
// queue, and callers do the work in the request as before.
import { logger } from './logging.js';
import { config } from '../runtime-config.js';
import { describeError } from './http.js';
import { afterResponse } from './after-response.js';
import { explainError } from './error-tracking.js';
import { withLogContext } from './log-context.js';
import { changedFields, type JobRow, type NewJob, type NoticeStore } from './store.js';
import { keyPointsCache, keyPointsFor, withKeyPoints } from './enrich.js';
import { saveDates } from './dates.js';
import { sendWithResend } from './mailer.js';
import type { NormalizedNotice } from './notice.js';

// Longer than a function may run (vercel.json, 120 s): a job taken by a
// worker that was stopped part way is taken again once this has passed
const LEASE_MS = 150_000;

interface Kind {
  maxAttempts: number;
  // The wait before try attempt + 1
  retryInMs: (attempt: number) => number;
  // Returns what the job did; throws to try again later, or for good when
  // the error has `permanent` set
  run: (job: JobRow, store: NoticeStore) => Promise<unknown>;
}

const KINDS: Record<string, Kind> = {
  'key-points': {
    // 15 minutes, 1 hour, 4 hours
    maxAttempts: 4,
    retryInMs: attempt => 15 * 60_000 * 4 ** (attempt - 1),
    run: async (job, store) => {
      const stored = (await store.byIds([job.key])).get(job.key);
      // Gone, without a document, or already done by another worker
      if (!stored?.dossierUrl || stored.keyPoints || stored.noKeyPoints) return 'nothing to do';
      const keyPoints = await keyPointsFor(stored as NormalizedNotice);
      if (!keyPoints) {
        // Read, but too short to summarise: marked so it is not read again.
        // Otherwise the read failed (logged).
        if (keyPointsCache.has(stored.id)) {
          await store.patch(stored.id, { noKeyPoints: true });
          return 'no key points in the document';
        }
        throw new Error('The document could not be read');
      }
      const updated = withKeyPoints(stored as NormalizedNotice, keyPoints);
      await store.patch(stored.id, changedFields(stored, updated));
      await saveDates([updated], store);
      return 'key points stored';
    }
  },
  digest: {
    // 5, 15 and 45 minutes, then about 2 and 7 hours: all within the 24 hours
    // Resend keeps an idempotency key, so a send that did go through is
    // never sent twice
    maxAttempts: 6,
    retryInMs: attempt => 5 * 60_000 * 3 ** (attempt - 1),
    run: async job => {
      const { apiKey, to, from } = config.digest;
      if (!apiKey || to.length === 0) throw Object.assign(new Error('RESEND_API_KEY and DIGEST_TO are not set'), { permanent: true });
      const { subject, html, text } = job.payload;
      const result = await sendWithResend({ apiKey, from, to, subject, html, text, idempotencyKey: `regsonar-digest/job-${job.id}` });
      logger.info(`[RegSonar Digest] Sent ${job.key} digest (Resend id ${result.id})`);
      return { id: result.id };
    }
  }
};

export const KEY_POINTS = 'key-points';
export const DIGEST = 'digest';

// Jobs to read the documents of these notices (saved already) for key points,
// other than those already read with nothing to summarise
export function keyPointJobs(notices: NormalizedNotice[]): NewJob[] {
  return notices.filter(n => n.dossierUrl && !n.keyPoints && keyPointsCache.get(n.id) !== null)
    .map(n => ({ kind: KEY_POINTS, key: n.id, payload: {}, maxAttempts: KINDS[KEY_POINTS].maxAttempts }));
}

// One digest per day: not queued again once that day's has been sent
export const digestJob = (day: string, email: { subject: string; html: string; text: string }): NewJob =>
  ({ kind: DIGEST, key: day, payload: email, maxAttempts: KINDS[DIGEST].maxAttempts, once: true });

export interface JobOutcome { id: string; kind: string; key: string; ok: boolean; result?: unknown; error?: string }

// Run due jobs, two at a time, until there are none or `until` has passed
export async function drainQueue(store: NoticeStore, { until, kinds }: { until: number; kinds?: string[] }): Promise<JobOutcome[]> {
  const outcomes: JobOutcome[] = [];
  const worker = async () => {
    while (Date.now() < until) {
      const [job] = await store.claim(1, LEASE_MS, kinds);
      if (!job) return;
      outcomes.push(await runJob(job, store));
    }
  };
  await Promise.all([worker(), worker()]);
  return outcomes;
}

async function runJob(job: JobRow, store: NoticeStore): Promise<JobOutcome> {
  const kind = KINDS[job.kind];
  const outcome = { id: job.id, kind: job.kind, key: job.key };
  if (!kind) {
    await store.failJob(job.id, `Unknown job kind ${job.kind}`, null);
    return { ...outcome, ok: false, error: 'unknown kind' };
  }
  try {
    // Log entries and captured errors while it runs say which job it is
    const result = await withLogContext({ job: { id: job.id, kind: job.kind, target: job.key, attempt: job.attempts } }, () => kind.run(job, store));
    await store.finishJob(job.id);
    return { ...outcome, ok: true, result };
  } catch (err: any) {
    const error = describeError(err);
    const retry = !err?.permanent && job.attempts < job.maxAttempts;
    logger.warn(`[RegSonar Queue] ${job.kind} ${job.key} failed (try ${job.attempts} of ${job.maxAttempts}): ${error}${retry ? '' : '; giving up'}`);
    // Given up on, for a bug or an error nobody expected rather than a site
    // that failed: captured, as no retry will fix it
    if (!retry) explainError(err, { where: `Job ${job.kind}`, target: job.key, attempts: job.attempts });
    await store.failJob(job.id, error, retry ? kind.retryInMs(job.attempts) : null);
    return { ...outcome, ok: false, error };
  }
}

// Run due jobs after this response, for up to a minute; one drain at a time
// per server instance (it takes jobs added meanwhile too)
const AFTER_RESPONSE_MS = 60_000;
let draining: Promise<unknown> | null = null;
export function drainAfterResponse(store: NoticeStore): void {
  if (draining) return;
  draining = drainQueue(store, { until: Date.now() + AFTER_RESPONSE_MS })
    .catch(err => logger.warn('[RegSonar Queue] Could not run jobs', err))
    .finally(() => { draining = null; });
  afterResponse(draining);
}

// Reading the sources: the live feed's cached reads, the scheduled check that
// fills the history, and the notices the email digest checks.
import { logger } from '../logging.js';
import { config } from '../runtime-config.js';
import { openStore, type NoticeStore, type ScheduledCheck, type StoreArg } from './store.js';
import { dedupeByDocument } from '../src/lib/dedupe.js';
import { randomUUID } from 'crypto';
import { describeError } from './http.js';
import type { NormalizedNotice } from './notice.js';
import { SOURCES } from './sources/index.js';
import { enrichWithKeyPoints, keyPointsCache, keyPointsFor, withKeyPoints } from './enrich.js';

// Government APIs (HKMA in particular) rate-limit aggressively, so each
// source is read again only once its notices are this old
const SOURCE_TTL_MS = config.ingestion.sourceTtlMs;

interface SourceState {
  notices: NormalizedNotice[];
  lastSuccessAt: string | null;
  lastAttemptAt: number;
  error?: string;
  inFlight?: Promise<void>;
}

const sourceState = new Map<string, SourceState>();

// Store notices in the history database, if there is one. Failures are logged
// and never affect the live feed.
async function archiveNotices(notices: NormalizedNotice[], store: StoreArg = openStore()) {
  if (notices.length === 0) return;
  try {
    await (await store)?.save(notices);
  } catch (err: any) {
    logger.warn('[RegSonar History] Could not save notices', err);
  }
}

// Refresh a source if its cache has expired. On failure the last good notices
// are kept and the error is reported alongside them.
export async function refreshSource(source: (typeof SOURCES)[number]): Promise<SourceState> {
  let state = sourceState.get(source.name);
  if (!state) {
    state = { notices: [], lastSuccessAt: null, lastAttemptAt: 0 };
    sourceState.set(source.name, state);
  }
  if (state.inFlight) {
    await state.inFlight;
  } else if (Date.now() - state.lastAttemptAt > SOURCE_TTL_MS) {
    const s = state;
    s.lastAttemptAt = Date.now();
    s.inFlight = source.fetch()
      .then(enrichWithKeyPoints)
      .then(async (notices) => {
        s.notices = notices;
        s.lastSuccessAt = new Date().toISOString();
        s.error = undefined;
        await archiveNotices(notices);
      })
      .catch((err) => {
        s.error = describeError(err);
        logger.info(`[RegSonar Feed Sentinel] ${source.name} failed: ${s.error}`);
      })
      .finally(() => {
        s.inFlight = undefined;
      });
    await s.inFlight;
  }
  return state;
}

// A scheduled check reads this many items from each source's list, so a
// source that publishes more between checks than the feed shows is still
// covered. When none of them is in the history yet (a new source, or a gap
// longer than the list), it reads further back.
const POLL_LIMIT = config.polling.limit;
const BACKFILL_LIMIT = config.polling.backfillLimit;

// Documents read for key points per source on each check, and for how long a
// check starts new reads (the function may run for 120s); later checks do the rest
const POLL_KEY_POINT_FETCHES = config.polling.keyPointFetches;
const POLL_FETCH_WINDOW_MS = config.polling.fetchWindowMs;

interface PollResult {
  name: string;
  read: number;
  added: number;
  backfilled: boolean;
  withoutKeyPoints: number;
  notices: NormalizedNotice[];
}

async function pollSource(source: (typeof SOURCES)[number], until: number, store: NoticeStore | null): Promise<PollResult> {
  let notices = await source.fetch(POLL_LIMIT);
  let stored = store ? await store.byIds(notices.map(n => n.id)) : new Map();
  let backfilled = false;
  if (store && notices.length >= POLL_LIMIT && stored.size === 0) {
    notices = await source.fetch(BACKFILL_LIMIT);
    stored = await store.byIds(notices.map(n => n.id));
    backfilled = true;
  }
  const enriched = await enrichWithKeyPoints(notices, { maxFetches: POLL_KEY_POINT_FETCHES, until }, store);
  await archiveNotices(enriched, store);
  return {
    name: source.name,
    read: notices.length,
    added: notices.filter(n => !stored.has(n.id)).length,
    backfilled,
    withoutKeyPoints: enriched.filter(n => n.dossierUrl && !n.keyPoints).length,
    notices: enriched
  };
}

// Pages of undated stored notices read on each check for the date they state
const POLL_DATE_BACKFILL = config.polling.dateBackfillLimit;

// Stored notices that came without a date (the FCA's feed gives none) and
// were stored before pages were read for one: read each page once for the
// date it states. A page that cannot be read is marked and not tried again.
async function backfillPageDates(until: number, store: NoticeStore | null): Promise<number> {
  if (!store) return 0;
  let dated = 0;
  for (const notice of await store.undated(POLL_DATE_BACKFILL)) {
    if (Date.now() >= until) break;
    keyPointsCache.delete(notice.id);
    const keyPoints = await keyPointsFor(notice);
    const updated = keyPoints ? withKeyPoints(notice, keyPoints) : { ...notice, pageDateTried: true };
    if (updated.publishedAt) dated++;
    await store.save([updated]);
  }
  return dated;
}

// Check every source and store what it lists in the history
export async function pollSources(storeArg: StoreArg = openStore()): Promise<{ results: PollResult[]; failed: { name: string; error: string }[]; pageDatesFound: number }> {
  const store = await storeArg;
  const check = { id: randomUUID(), startedAt: new Date().toISOString(), completedAt: null as string | null, status: 'running' as const, summary: null };
  const record = async (value: ScheduledCheck) => {
    if (store) await store.saveCheck(value).catch((err: any) => logger.warn('[RegSonar Poll] Could not record check', err));
  };
  await record(check);
  try {
    const until = Date.now() + POLL_FETCH_WINDOW_MS;
    let pageDateError: string | null = null;
    const [settled, pageDatesFound] = await Promise.all([
      Promise.allSettled(SOURCES.map(s => pollSource(s, until, store))),
      backfillPageDates(until, store).catch((err: any) => {
        logger.warn('[RegSonar History] Could not backfill page dates', err);
        pageDateError = describeError(err);
        return 0;
      })
    ]);
    const results: PollResult[] = [];
    const failed: { name: string; error: string }[] = [];
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled') results.push(r.value);
      else failed.push({ name: SOURCES[i].name, error: describeError(r.reason) });
    });
    if (pageDateError) failed.push({ name: 'Publication date backfill', error: pageDateError });
    const summary = { sources: results.map(({ notices: _notices, ...r }) => r), failed, pageDatesFound };
    await record({ ...check, completedAt: new Date().toISOString(), status: 'completed', summary });
    return { results, failed, pageDatesFound };
  } catch (error) {
    await record({ ...check, completedAt: new Date().toISOString(), status: 'failed',
      summary: { sources: [], failed: [{ name: 'Scheduled check', error: describeError(error) }], pageDatesFound: 0 } });
    throw error;
  }
}

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

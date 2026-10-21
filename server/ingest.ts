// Reading the sources: the live feed's cached reads, and the scheduled check
// that fills the history.
import { logger } from './logging.js';
import { config } from '../runtime-config.js';
import { openStore, type NoticeStore, type ScheduledCheck, type StoreArg } from './store.js';
import { randomUUID } from 'crypto';
import { describeError } from './http.js';
import type { NormalizedNotice } from './notice.js';
import { SOURCES } from './sources/index.js';
import { enrichWithKeyPoints, keyPointsCache, keyPointsFor, withKeyPoints } from './enrich.js';
import { linkSaved, relinkAll } from './links.js';
import { rebuildDates, saveDates } from './dates.js';

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

// Store notices in the history database, if there is one, with their dates,
// and link them to the consultations or outcomes they match. Failures are logged and never
// affect the live feed. A scheduled check leaves out the dates and links
// (`relate: false`): it works them out for the whole history once at the end.
async function archiveNotices(notices: NormalizedNotice[], sourceId: string, storeArg: StoreArg = openStore(), { relate = true } = {}) {
  if (notices.length === 0) return;
  try {
    const store = await storeArg;
    if (!store) return;
    await store.save(notices, sourceId);
    if (!relate) return;
    await saveDates(notices, store);
    await linkSaved(notices, store);
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
        await archiveNotices(notices, source.id);
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
  id: string;
  name: string;
  read: number;
  added: number;
  backfilled: boolean;
  withoutKeyPoints: number;
  notices: NormalizedNotice[];
}

// Notices whose id already names a different document: one saved under that
// id with another link, or another notice read with the same id. Only one
// copy is kept under an id, so these are reported rather than passed over.
export function idConflicts(notices: NormalizedNotice[], stored: Map<string, { dossierUrl?: string }>) {
  const conflicts: { id: string; saved: string; read: string }[] = [];
  const read = new Map<string, string | undefined>();
  for (const n of notices) {
    const saved = read.has(n.id) ? read.get(n.id) : stored.get(n.id)?.dossierUrl;
    if (saved && n.dossierUrl && saved !== n.dossierUrl) conflicts.push({ id: n.id, saved, read: n.dossierUrl });
    if (!read.has(n.id)) read.set(n.id, n.dossierUrl);
  }
  return conflicts;
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
  for (const conflict of idConflicts(notices, stored)) {
    logger.warn('[RegSonar History] Notice id already names another document', { source: source.name, ...conflict });
  }
  // The stored copies just read give the key points already in the history
  const enriched = await enrichWithKeyPoints(notices, { maxFetches: POLL_KEY_POINT_FETCHES, until }, store, stored);
  await archiveNotices(enriched, source.id, store, { relate: false });
  return {
    id: source.id,
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
export async function pollSources(storeArg: StoreArg = openStore()): Promise<{ results: PollResult[]; failed: { name: string; error: string }[]; pageDatesFound: number; links?: number; dates?: number }> {
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
    // Every consultation link, matched again over the whole history
    let links: number | undefined;
    if (store) {
      try {
        links = await relinkAll(store);
        logger.info(`[RegSonar History] ${links} consultation links`);
      } catch (err: any) {
        logger.warn('[RegSonar History] Could not rebuild consultation links', err);
        failed.push({ name: 'Consultation links', error: describeError(err) });
      }
    }
    // Every notice's dates, worked out again over the whole history
    let dates: number | undefined;
    if (store) {
      try {
        dates = await rebuildDates(store);
        logger.info(`[RegSonar History] ${dates} notice dates`);
      } catch (err: any) {
        logger.warn('[RegSonar History] Could not rebuild notice dates', err);
        failed.push({ name: 'Notice dates', error: describeError(err) });
      }
    }
    const summary = { sources: results.map(({ notices: _notices, ...r }) => r), failed, pageDatesFound, links, dates };
    await record({ ...check, completedAt: new Date().toISOString(), status: 'completed', summary });
    return { results, failed, pageDatesFound, links, dates };
  } catch (error) {
    await record({ ...check, completedAt: new Date().toISOString(), status: 'failed',
      summary: { sources: [], failed: [{ name: 'Scheduled check', error: describeError(error) }], pageDatesFound: 0 } });
    throw error;
  }
}

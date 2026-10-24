// The notice history, as the services use it: saving and reading notices and
// scheduled checks. The only server code that uses db.ts, and the one place
// that turns a notice into a stored row and back. How a stored notice is
// shown in the feed (dates worked out again, tags) is server/history.ts's job.
import {
  getDb, databaseUrl, saveNotices, patchNotice, recentNotices, searchNotices, linkCandidates, addLinks, replaceLinks, linksOf, undatedNotices,
  dateFields, replaceDates, archiveStats, storedNotices, saveScheduledCheck, scheduledCheckStatus, type Db, type ScheduledCheck,
  type DateRow, type SearchPosition, enqueueJobs, claimJobs, finishJob, failJob, pruneJobs, jobCounts, type JobRow, type NewJob,
  readCache, writeCache, pruneCache, countHit, pruneHits
} from './db.js';
import type { LinkPair, RelatedCandidate } from '../shared/related.js';
import type { NormalizedNotice } from './notice.js';

// A notice as stored: without what is worked out when it is read back (the
// history mark and related notices). pageDateTried marks a page read once for
// a date it did not state; noKeyPoints, a document read with too little text
// to summarise, so it is not read again (documents don't change once published).
export type Marks = { pageDateTried?: boolean; noKeyPoints?: boolean };
export type StoredNotice = Omit<NormalizedNotice, 'archived' | 'related'> & Marks;

export function toStored(notice: NormalizedNotice & Marks): StoredNotice {
  const { archived: _archived, related: _related, ...stored } = notice;
  return stored;
}

// The fields of `after` that differ from `before`: what to patch() into a
// stored notice, leaving what others saved meanwhile as it is
export function changedFields(before: object, after: object): Record<string, unknown> {
  const was = before as Record<string, unknown>;
  return Object.fromEntries(Object.entries(after).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(was[k])));
}

// Rows hold the notice as JSON written by toStored
const fromRow = (row: unknown) => row as StoredNotice;

// Transaction-level advisory locks, one for each set of rows that is worked
// out again from the whole history (server/migrations.ts has its own)
const LOCKS = { dates: 7_301_926_144, links: 7_301_926_145 } as const;
export type StoreLock = keyof typeof LOCKS;

export type CheckStatus = Awaited<ReturnType<typeof scheduledCheckStatus>>;
export type { ScheduledCheck, DateRow, JobRow, NewJob, SearchPosition };

export interface NoticeStore {
  // sourceId: the source that read them (left out when re-saving a stored copy)
  save(notices: (NormalizedNotice & Marks)[], sourceId?: string): Promise<void>;
  // Merge these fields into a stored notice, keeping the rest as stored now
  patch(id: string, fields: Partial<StoredNotice>): Promise<void>;
  // Runs fn in one transaction, after anyone else holding the same lock has
  // finished: what is read under it and written back is not changed meanwhile
  // by another holder (server/dates.ts, server/links.ts)
  exclusive<T>(lock: StoreLock, fn: (store: NoticeStore) => Promise<T>): Promise<T>;
  // Stored copies by id
  byIds(ids: string[]): Promise<Map<string, StoredNotice>>;
  // Published in the last `days` days, newest first, other than excludeIds
  recent(days: number, limit: number, excludeIds?: string[]): Promise<StoredNotice[]>;
  // Full-text search over titles, summaries and key points, best matches
  // first, a page at a time: the page after `after`, and where it ended
  search(query: string, limit: number, after?: SearchPosition): Promise<{ notices: StoredNotice[]; next: SearchPosition | null }>;
  // Every notice, or a few regulators', as matching consultations to outcomes needs them
  linkCandidates(regulators?: string[]): Promise<RelatedCandidate[]>;
  // Store links between consultations and outcomes: add these, or make the stored ones exactly these
  addLinks(links: LinkPair[]): Promise<void>;
  replaceLinks(links: LinkPair[]): Promise<void>;
  // The stored links of these notices, and the notices at either end
  links(ids: string[]): Promise<{ links: LinkPair[]; notices: RelatedCandidate[] }>;
  // Every notice, as working out its dates needs it (server/dates.ts)
  dateFields(): Promise<StoredNotice[]>;
  // Make the stored dates of these notices, or of every notice, exactly these
  replaceDates(dates: DateRow[], ids?: string[]): Promise<void>;
  // Without a date and whose page has not been checked for one, oldest seen first
  undated(limit: number): Promise<StoredNotice[]>;
  stats(): Promise<{ count: number; since: string | null }>;
  saveCheck(check: ScheduledCheck): Promise<void>;
  checkStatus(): Promise<CheckStatus>;
  // Background jobs (server/queue.ts): add (one waiting per kind and key),
  // take due ones for a while, mark done, or failed (to retry after
  // retryInMs, or with null for good); finished ones are pruned
  enqueue(jobs: NewJob[]): Promise<number>;
  claim(limit: number, leaseMs: number, kinds?: string[]): Promise<JobRow[]>;
  finishJob(id: string): Promise<void>;
  failJob(id: string, error: string, retryInMs: number | null): Promise<void>;
  pruneJobs(): Promise<void>;
  jobCounts(): Promise<{ waiting: number; failed: number }>;
  // The shared cache (server/shared-cache.ts): entries stored less than
  // maxAgeMs ago, storing entries, and removing old ones
  cached(keys: string[], maxAgeMs: number): Promise<Map<string, { value: unknown; at: number }>>;
  cache(entries: [string, unknown][]): Promise<void>;
  pruneCache(): Promise<void>;
  // Rate limits counted across instances (server/rate-limits.ts): count a
  // request in the current window, and remove ended windows
  countHit(key: string, windowMs: number): Promise<{ hits: number; resetInMs: number }>;
  pruneHits(): Promise<void>;
}

export function noticeStore(db: Db): NoticeStore {
  const store: NoticeStore = {
    save: (notices, sourceId) => saveNotices(db, notices.map(toStored), sourceId),
    patch: (id, fields) => patchNotice(db, id, fields),
    // A database without transactions (a test's stand-in) runs fn as it is
    exclusive: (lock, fn) => (db.transaction
      ? db.transaction(async tx => {
        await tx.query('SELECT pg_advisory_xact_lock($1)', [LOCKS[lock]]);
        return fn(noticeStore(tx));
      })
      : fn(store)),
    byIds: async ids => new Map([...(await storedNotices(db, ids))].map(([id, row]) => [id, fromRow(row)])),
    recent: async (days, limit, excludeIds) => (await recentNotices(db, days, limit, excludeIds)).map(fromRow),
    search: async (query, limit, after) => {
      const { rows, next } = await searchNotices(db, query, limit, after);
      return { notices: rows.map(fromRow), next };
    },
    linkCandidates: async regulators => (await linkCandidates(db, regulators)) as unknown as RelatedCandidate[],
    addLinks: links => addLinks(db, links),
    replaceLinks: links => replaceLinks(db, links),
    links: async ids => (await linksOf(db, ids)) as unknown as { links: LinkPair[]; notices: RelatedCandidate[] },
    dateFields: async () => (await dateFields(db)).map(fromRow),
    replaceDates: (dates, ids) => replaceDates(db, dates, ids),
    undated: async limit => (await undatedNotices(db, limit)).map(fromRow),
    stats: () => archiveStats(db),
    saveCheck: check => saveScheduledCheck(db, check),
    checkStatus: () => scheduledCheckStatus(db),
    enqueue: jobs => enqueueJobs(db, jobs),
    claim: (limit, leaseMs, kinds) => claimJobs(db, limit, leaseMs, kinds),
    finishJob: id => finishJob(db, id),
    failJob: (id, error, retryInMs) => failJob(db, id, error, retryInMs),
    pruneJobs: () => pruneJobs(db),
    jobCounts: () => jobCounts(db),
    cached: (keys, maxAgeMs) => readCache(db, keys, maxAgeMs),
    cache: entries => writeCache(db, entries),
    pruneCache: () => pruneCache(db),
    countHit: (key, windowMs) => countHit(db, key, windowMs),
    pruneHits: () => pruneHits(db)
  };
  return store;
}

const stores = new WeakMap<Db, NoticeStore>();

// The history, or null when none is configured or it cannot be reached
export async function openStore(): Promise<NoticeStore | null> {
  const db = await getDb();
  if (!db) return null;
  let store = stores.get(db);
  if (!store) stores.set(db, store = noticeStore(db));
  return store;
}

// Whether a history is set up (it may still be unreachable)
export const historyConfigured = () => !!databaseUrl();

// Services take the store as an argument, defaulting to the open one, so
// tests can pass their own
export type StoreArg = NoticeStore | null | Promise<NoticeStore | null>;

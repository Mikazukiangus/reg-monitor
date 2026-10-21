// The notice history, as the services use it: saving and reading notices and
// scheduled checks. The only server code that uses db.ts, and the one place
// that turns a notice into a stored row and back. How a stored notice is
// shown in the feed (dates worked out again, tags) is server/history.ts's job.
import {
  getDb, databaseUrl, saveNotices, recentNotices, searchNotices, linkCandidates, addLinks, replaceLinks, linksOf, undatedNotices,
  archiveStats, storedNotices, saveScheduledCheck, scheduledCheckStatus, type Db, type ScheduledCheck
} from './db.js';
import type { LinkPair, RelatedCandidate } from '../shared/related.js';
import type { NormalizedNotice } from './notice.js';

// A notice as stored: without what is worked out when it is read back (the
// history mark and related notices). pageDateTried marks a page read once for
// a date it did not state.
export type StoredNotice = Omit<NormalizedNotice, 'archived' | 'related'> & { pageDateTried?: boolean };

export function toStored(notice: NormalizedNotice & { pageDateTried?: boolean }): StoredNotice {
  const { archived: _archived, related: _related, ...stored } = notice;
  return stored;
}

// Rows hold the notice as JSON written by toStored
const fromRow = (row: unknown) => row as StoredNotice;

export type CheckStatus = Awaited<ReturnType<typeof scheduledCheckStatus>>;
export type { ScheduledCheck };

export interface NoticeStore {
  // sourceId: the source that read them (left out when re-saving a stored copy)
  save(notices: (NormalizedNotice & { pageDateTried?: boolean })[], sourceId?: string): Promise<void>;
  // Stored copies by id
  byIds(ids: string[]): Promise<Map<string, StoredNotice>>;
  // Published in the last `days` days, newest first
  recent(days: number, limit: number): Promise<StoredNotice[]>;
  // Full-text search over titles, summaries and key points, best matches first
  search(query: string, limit: number): Promise<StoredNotice[]>;
  // Every notice, or a few regulators', as matching consultations to outcomes needs them
  linkCandidates(regulators?: string[]): Promise<RelatedCandidate[]>;
  // Store links between consultations and outcomes: add these, or make the stored ones exactly these
  addLinks(links: LinkPair[]): Promise<void>;
  replaceLinks(links: LinkPair[]): Promise<void>;
  // The stored links of these notices, and the notices at either end
  links(ids: string[]): Promise<{ links: LinkPair[]; notices: RelatedCandidate[] }>;
  // Without a date and whose page has not been checked for one, oldest seen first
  undated(limit: number): Promise<StoredNotice[]>;
  stats(): Promise<{ count: number; since: string | null }>;
  saveCheck(check: ScheduledCheck): Promise<void>;
  checkStatus(): Promise<CheckStatus>;
}

export function noticeStore(db: Db): NoticeStore {
  return {
    save: (notices, sourceId) => saveNotices(db, notices.map(toStored), sourceId),
    byIds: async ids => new Map([...(await storedNotices(db, ids))].map(([id, row]) => [id, fromRow(row)])),
    recent: async (days, limit) => (await recentNotices(db, days, limit)).map(fromRow),
    search: async (query, limit) => (await searchNotices(db, query, limit)).map(fromRow),
    linkCandidates: async regulators => (await linkCandidates(db, regulators)) as unknown as RelatedCandidate[],
    addLinks: links => addLinks(db, links),
    replaceLinks: links => replaceLinks(db, links),
    links: async ids => (await linksOf(db, ids)) as unknown as { links: LinkPair[]; notices: RelatedCandidate[] },
    undated: async limit => (await undatedNotices(db, limit)).map(fromRow),
    stats: () => archiveStats(db),
    saveCheck: check => saveScheduledCheck(db, check),
    checkStatus: () => scheduledCheckStatus(db)
  };
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

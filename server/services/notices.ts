// Notices from the history: search, and lookup by id. `enabled` is false when
// no history database is set up.
import { openStore, type StoreArg } from '../store.js';
import { dedupeByDocument } from '../../shared/dedupe.js';
import { fromArchive, withLinks } from '../history.js';
import type { NormalizedNotice } from '../notice.js';

export interface HistoryResult { enabled: boolean; notices: NormalizedNotice[] }

// Titles, summaries and key points, at most 40 notices
export async function searchNotices(query: string, storeArg: StoreArg = openStore()): Promise<HistoryResult> {
  const store = await storeArg;
  if (!store) return { enabled: false, notices: [] };
  return { enabled: true, notices: await withLinks(dedupeByDocument((await store.search(query, 40)).map(fromArchive)), store) };
}

// Exact ids, for shared links and saved notices; ids not stored are left out
export async function noticesByIds(ids: string[], storeArg: StoreArg = openStore()): Promise<HistoryResult> {
  const store = await storeArg;
  const found = store ? await store.byIds(ids) : new Map();
  return { enabled: !!store, notices: await withLinks([...found.values()].map(fromArchive), store) };
}

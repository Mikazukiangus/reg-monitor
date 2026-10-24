// Notices from the history: search, and lookup by id. `enabled` is false when
// no history database is set up.
import { openStore, type SearchPosition, type StoreArg } from '../store.js';
import { encodeCursor } from '../cursor.js';
import { dedupeByDocument } from '../../shared/dedupe.js';
import { fromArchive, withLinks } from '../history.js';
import type { NormalizedNotice } from '../notice.js';

export interface HistoryResult { enabled: boolean; notices: NormalizedNotice[] }

// Search results per page, unless the request asks for fewer or more
export const SEARCH_PAGE = 40;
export const MAX_SEARCH_PAGE = 100;

// Titles, summaries and key points, a page at a time: the first page, or the
// one after `after` (an earlier page's nextCursor). nextCursor is null on the
// last page. Copies of one document are merged within a page.
export async function searchNotices(
  query: string, storeArg: StoreArg = openStore(), { limit = SEARCH_PAGE, after }: { limit?: number; after?: SearchPosition } = {}
): Promise<HistoryResult & { nextCursor: string | null }> {
  const store = await storeArg;
  if (!store) return { enabled: false, notices: [], nextCursor: null };
  const { notices, next } = await store.search(query, limit, after);
  return {
    enabled: true,
    notices: await withLinks(dedupeByDocument(notices.map(fromArchive)), store),
    nextCursor: next ? encodeCursor(next) : null
  };
}

// Exact ids, for shared links and saved notices; ids not stored are left out
export async function noticesByIds(ids: string[], storeArg: StoreArg = openStore()): Promise<HistoryResult> {
  const store = await storeArg;
  const found = store ? await store.byIds(ids) : new Map();
  return { enabled: !!store, notices: await withLinks([...found.values()].map(fromArchive), store) };
}

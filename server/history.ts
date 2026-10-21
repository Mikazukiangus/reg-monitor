// Notices read back from the history database, and the live feed with recent
// notices from the history added, and each notice's consultation links.
import { logger } from './logging.js';
import { config } from '../runtime-config.js';
import { historyConfigured, openStore, type NoticeStore, type StoredNotice, type StoreArg } from './store.js';
import { linkPairs, relatedOf, type LinkPair, type RelatedCandidate } from '../shared/related.js';
import { dedupeByDocument } from '../shared/dedupe.js';
import { type NormalizedNotice, tagNotice, formatOf, getRelativeTime } from './notice.js';
import { closingDateFields } from './text.js';
import { LINK_ONLY } from './sources/us-feeds.js';
import { withKeyPoints } from './enrich.js';

// How far back the feed reaches into the history, and how many notices at most
// it adds (notices also in the live feed are not counted)
const ARCHIVE_FEED_DAYS = config.archive.days;
const ARCHIVE_FEED_LIMIT = config.archive.limit;

// Dates taken from a document's text are worked out again whenever a stored
// notice is read, so a rule change reaches the whole history. Copies stored
// before October 2026 mark them "Date in source", or have a closing date from
// the text on a notice that is not a consultation.
function withoutTextDates(n: NormalizedNotice): NormalizedNotice {
  const legacyClosing = n.keyPoints?.closingDate?.date;
  const fromText = !!n.deadlineQuote || /^Date in source: /.test(n.statutoryDeadline || '') ||
    (!!legacyClosing && n.statutoryDeadline?.match(/^Comments closed?: (.*)$/)?.[1] === legacyClosing && formatOf(n.type, n.title) !== 'Consultations');
  if (!fromText) return n;
  const { deadlineDate: _d, statutoryDeadline: _s, statusBadge: _b, deadlineQuote: _q, ...rest } = n;
  return rest;
}

export const fromArchive = (stored: StoredNotice): NormalizedNotice => {
  let n = withoutTextDates({
    ...stored,
    // Copies stored before link-only descriptions were dropped
    summary: LINK_ONLY.test(stored.summary || '') ? undefined : stored.summary,
    archived: true,
    isLiveFeed: false,
    issuedTimeAgo: stored.publishedAt ? getRelativeTime(stored.publishedAt) : 'Earlier'
  });
  // A source's closing date stored while it was still ahead
  const closes = n.statutoryDeadline?.match(/^Comments close: (\d{4}-\d{2}-\d{2})$/)?.[1];
  if (closes) n = { ...n, deadlineDate: undefined, ...closingDateFields(closes) };
  return n.keyPoints ? withKeyPoints(n, n.keyPoints) : tagNotice(n);
};

// The consultation links each notice shows: those stored in the history
// (server/links.ts), or without a history, those among the notices themselves
export async function withLinks(notices: NormalizedNotice[], store: NoticeStore | null): Promise<NormalizedNotice[]> {
  const byId = new Map<string, RelatedCandidate>(notices.map(n => [n.id, n]));
  let pairs: LinkPair[];
  if (store) {
    try {
      const stored = await store.links(notices.map(n => n.id));
      pairs = stored.links;
      for (const n of stored.notices) if (!byId.has(n.id)) byId.set(n.id, n);
    } catch (err: any) {
      logger.warn('[RegSonar History] Could not read consultation links', err);
      return notices;
    }
  } else {
    pairs = linkPairs(notices);
  }
  return notices.map(n => {
    const related = relatedOf(n.id, pairs, byId);
    return related.length ? { ...n, related } : n;
  });
}

// Add the last 30 days from the history to the live notices, and each
// notice's consultation links
export async function withHistory(live: NormalizedNotice[], storeArg: StoreArg = openStore()) {
  const store = await storeArg;
  let notices = live;
  let archive: { enabled: boolean; count?: number; since?: string | null; error?: string } = { enabled: false };
  if (store) {
    try {
      const liveIds = new Set(live.map(n => n.id));
      const [recent, stats] = await Promise.all([
        store.recent(ARCHIVE_FEED_DAYS, ARCHIVE_FEED_LIMIT, [...liveIds]),
        store.stats()
      ]);
      // A full limit means older notices of the window were left out
      if (recent.length >= ARCHIVE_FEED_LIMIT) {
        logger.warn(`[RegSonar History] The feed reached ARCHIVE_FEED_LIMIT (${ARCHIVE_FEED_LIMIT}); history notices older than ${recent.at(-1)?.publishedAt} were left out`);
      }
      notices = [...live, ...recent.filter(n => !liveIds.has(n.id)).map(fromArchive)];
      archive = { enabled: true, ...stats };
    } catch (err: any) {
      logger.warn('[RegSonar History] Could not read history', err);
      archive = { enabled: true, error: 'The history database could not be read' };
    }
  } else if (historyConfigured()) {
    archive = { enabled: true, error: 'The history database could not be reached' };
  }
  return { notices: await withLinks(dedupeByDocument(notices), store), archive };
}

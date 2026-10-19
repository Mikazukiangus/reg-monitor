// Notices read back from the history database, and the live feed with recent
// notices from the history added and related notices linked.
import { logger } from '../logging.js';
import { config } from '../runtime-config.js';
import { historyConfigured, openStore, type StoredNotice, type StoreArg } from './store.js';
import { findRelated, RelatedCandidate } from '../src/lib/related.js';
import { dedupeByDocument } from '../src/lib/dedupe.js';
import { type NormalizedNotice, tagNotice, formatOf, getRelativeTime } from './notice.js';
import { closingDateFields } from './text.js';
import { LINK_ONLY } from './sources/us-feeds.js';
import { withKeyPoints } from './enrich.js';

// How far back the feed reaches into the history, and how many notices at most
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

// Add the last 30 days from the history to the live notices, and link
// consultations to their conclusions
export async function withHistory(live: NormalizedNotice[], storeArg: StoreArg = openStore()) {
  const store = await storeArg;
  let notices = live;
  let archive: { enabled: boolean; count?: number; since?: string | null; error?: string } = { enabled: false };
  let candidates: RelatedCandidate[] = live;
  if (store) {
    try {
      const liveIds = new Set(live.map(n => n.id));
      const [recent, stats, linkable] = await Promise.all([
        store.recent(ARCHIVE_FEED_DAYS, ARCHIVE_FEED_LIMIT),
        store.stats(),
        store.consultationCandidates()
      ]);
      notices = [...live, ...recent.filter(n => !liveIds.has(n.id)).map(fromArchive)];
      archive = { enabled: true, ...stats };
      candidates = [...linkable, ...live.filter(n => !linkable.some(c => c.id === n.id))] as RelatedCandidate[];
    } catch (err: any) {
      logger.warn('[RegSonar History] Could not read history', err);
      archive = { enabled: true, error: 'The history database could not be read' };
    }
  } else if (historyConfigured()) {
    archive = { enabled: true, error: 'The history database could not be reached' };
  }
  notices = dedupeByDocument(notices).map(n => {
    const related = findRelated(n, candidates);
    return related.length ? { ...n, related } : n;
  });
  return { notices, archive };
}

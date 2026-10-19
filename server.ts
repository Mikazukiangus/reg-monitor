import express, { Request, Response, NextFunction } from 'express';
import { logger } from './logging.js';
import { config } from './runtime-config.js';
import { cdnCacheControl } from './config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { summarize, extractArticleText, pagePublishedDate, extractPdfText, htmlToText } from './summarize.js';
import { matchDigest, renderDigest, sendWithResend, singaporeDate } from './digest.js';
import { DIGEST_RULES } from './digest-rules.js';
import type { KeyPoints } from './src/types/regulatory.js';
import { getDb, saveNotices, recentNotices, searchNotices, consultationCandidates, archiveStats, databaseUrl, storedNotices, undatedNotices, saveScheduledCheck, scheduledCheckStatus, type StoredNotice } from './db.js';
import { findRelated, RelatedCandidate } from './src/lib/related.js';
import { dedupeByDocument } from './src/lib/dedupe.js';
import { rateLimit, reuseFor } from './src/lib/throttle.js';
import { randomUUID } from 'crypto';
import { politeFetch, RateLimitedError, FETCH_TIMEOUT_MS, fetchOrThrow, describeError } from './server/http.js';
import { type NormalizedNotice, tagNotice, formatOf, getRelativeTime } from './server/notice.js';
import { closingDateFields } from './server/text.js';
import { fetchSgxDocText } from './server/sources/sgx.js';
import { LINK_ONLY } from './server/sources/us-feeds.js';
import { type EndpointDefinition, ENDPOINTS, SOURCES } from './server/sources/index.js';
import { withKeyPointsUntagged } from './server/dates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type EndpointStatus = 'Operational' | 'Degraded' | 'Down';

// Pages that return HTTP 200 but carry no usable content
const UNUSABLE_PAGE_TITLE = /maintenance|just a moment|attention required|access denied|service unavailable/i;
const FIREWALL_BLOCK_BODY = /your request has been blocked/i;

// Probe one endpoint and report what actually happened. Never invents a status.
async function probeEndpoint(ep: EndpointDefinition) {
  const start = Date.now();
  try {
    const res = await politeFetch(ep.url);
    const body = await res.text();
    const pingMs = Date.now() - start;
    const pageTitle = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();

    let status: EndpointStatus;
    let detail: string;
    if (res.status >= 500) {
      status = 'Down';
      detail = `HTTP ${res.status}`;
    } else if (!res.ok) {
      status = 'Degraded';
      if (FIREWALL_BLOCK_BODY.test(body)) {
        detail = `HTTP ${res.status}: blocked by site firewall (likely rate limiting)`;
      } else if (pageTitle && UNUSABLE_PAGE_TITLE.test(pageTitle)) {
        detail = `HTTP ${res.status}: blocked ("${pageTitle}")`;
      } else {
        detail = `HTTP ${res.status}`;
      }
    } else if (pageTitle && UNUSABLE_PAGE_TITLE.test(pageTitle)) {
      status = 'Degraded';
      detail = `HTTP ${res.status} but page says "${pageTitle}"`;
    } else {
      status = 'Operational';
      detail = `HTTP ${res.status}`;
    }

    return { ...ep, status, statusCode: res.status, pingMs, detail: logger.errorMessage(detail) };
  } catch (err: any) {
    if (err instanceof RateLimitedError) {
      return { ...ep, status: 'Degraded' as EndpointStatus, statusCode: 429, pingMs: null, detail: logger.errorMessage(err) };
    }
    const detail = err?.name === 'TimeoutError'
      ? `Timed out after ${FETCH_TIMEOUT_MS / 1000}s`
      : logger.errorMessage(err?.cause?.code || err);
    return { ...ep, status: 'Down' as EndpointStatus, statusCode: null, pingMs: null, detail };
  }
}

// Government APIs (HKMA in particular) rate-limit aggressively, so probes and
// source fetches are cached rather than repeated on every client poll.
const HEALTH_TTL_MS = config.ingestion.healthTtlMs;
const SOURCE_TTL_MS = config.ingestion.sourceTtlMs;

let healthCache: { at: number; results: Promise<Awaited<ReturnType<typeof probeEndpoint>>[]> } | null = null;

function getEndpointsHealth() {
  if (!healthCache || Date.now() - healthCache.at > HEALTH_TTL_MS) {
    healthCache = { at: Date.now(), results: Promise.all(ENDPOINTS.map(probeEndpoint)) };
  }
  return healthCache.results;
}

// Key points per notice id. Documents don't change once published, so each is
// fetched and summarised once per server process. A failed fetch is not
// cached, so it is retried the next time its source refreshes.
const keyPointsCache = new Map<string, KeyPoints | null>();

// HKMA circulars and consultations link to BRDR landing pages that only hold
// metadata; the document itself is the first PDF linked from the page
const BRDR_PAGE = /^https:\/\/brdr\.hkma\.gov\.hk\//;
const BRDR_PDF_LINK = /href="(\/eng\/doc-ldg\/docId\/getPdf\/[^"]+\.pdf)"/i;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

async function fetchBrdrPdfText(pageUrl: string): Promise<{ text: string; ocr: boolean; pdfUrl: string }> {
  const page = await (await fetchOrThrow(pageUrl)).text();
  const href = page.match(BRDR_PDF_LINK)?.[1];
  if (!href) throw new Error('No PDF link on BRDR page');
  const pdfUrl = new URL(href, pageUrl).toString();
  const data = new Uint8Array(await (await fetchOrThrow(pdfUrl)).arrayBuffer());
  if (data.byteLength > MAX_PDF_BYTES) throw new Error(`PDF too large (${data.byteLength} bytes)`);
  return { ...(await extractPdfText(data)), pdfUrl };
}

// SFC document pages are an empty shell filled in from a JSON API on the same
// site; the document's HTML is read from that API instead
const SFC_DOC_PAGE = /^https:\/\/apps\.sfc\.hk\/edistributionWeb\/gateway\/EN\/(news-and-announcements\/news|circular)\/doc\?refNo=([\w-]+)/;

async function fetchSfcDocText(pageUrl: string): Promise<string | null> {
  const match = pageUrl.match(SFC_DOC_PAGE);
  if (!match) return null;
  const kind = match[1] === 'circular' ? 'circular' : 'news';
  const res = await fetchOrThrow(`https://apps.sfc.hk/edistributionWeb/api/${kind}/content?refNo=${match[2]}&lang=EN`);
  const doc = await res.json();
  return typeof doc?.html === 'string' ? htmlToText(doc.html) : '';
}

async function keyPointsFor(notice: NormalizedNotice): Promise<KeyPoints | null> {
  if (keyPointsCache.has(notice.id)) return keyPointsCache.get(notice.id)!;
  try {
    let text: string;
    let ocr = false;
    let published: string | null = null;
    let sourceUrl = notice.dossierUrl!;
    const docText = (await fetchSfcDocText(sourceUrl)) ?? (await fetchSgxDocText(sourceUrl));
    if (docText !== null) {
      text = docText;
    } else if (BRDR_PAGE.test(sourceUrl)) {
      ({ text, ocr, pdfUrl: sourceUrl } = await fetchBrdrPdfText(sourceUrl));
    } else {
      const res = await fetchOrThrow(sourceUrl);
      // A PDF by its address or, for links without ".pdf" (PDPC reports), by its type
      if (/\.pdf$/i.test(new URL(sourceUrl).pathname) || /^application\/pdf\b/i.test(res.headers.get('content-type') ?? '')) {
        const data = new Uint8Array(await res.arrayBuffer());
        if (data.byteLength > MAX_PDF_BYTES) throw new Error(`PDF too large (${data.byteLength} bytes)`);
        ({ text, ocr } = await extractPdfText(data));
      } else {
        const html = await res.text();
        text = extractArticleText(html, sourceUrl);
        published = pagePublishedDate(html) ?? null;
      }
    }
    const result = text.length > 200 ? { ...summarize(text, { sourceUrl }), ...(ocr ? { ocr } : {}), published } : null;
    keyPointsCache.set(notice.id, result);
    return result;
  } catch (err: any) {
    logger.info(`[RegSonar Summaries] Could not fetch ${notice.dossierUrl}: ${describeError(err)}`);
    return null;
  }
}

// A notice with its key points, and the date they give
function withKeyPoints(notice: NormalizedNotice, keyPoints: KeyPoints): NormalizedNotice {
  return tagNotice(withKeyPointsUntagged(notice, keyPoints));
}

// Key points already in the history, so documents are read once rather than
// again by every new server instance
async function storedKeyPoints(notices: NormalizedNotice[]): Promise<Map<string, KeyPoints>> {
  try {
    const db = await getDb();
    if (!db) return new Map();
    const stored = await storedNotices(db, notices.map(n => n.id));
    return new Map([...stored].filter(([, n]) => n.keyPoints).map(([id, n]) => [id, n.keyPoints as KeyPoints]));
  } catch (err: any) {
    logger.warn('[RegSonar History] Could not read stored key points', err);
    return new Map();
  }
}

// Attach key points to notices that link to a document page. Fetches run one
// at a time per source to stay polite to regulator sites. A scheduled check
// limits how many documents it reads (and until when); later checks do the rest.
async function enrichWithKeyPoints(
  notices: NormalizedNotice[],
  budget: { maxFetches: number; until: number } = { maxFetches: Infinity, until: Infinity }
): Promise<NormalizedNotice[]> {
  const stored = await storedKeyPoints(notices);
  const enriched: NormalizedNotice[] = [];
  let fetches = 0;
  for (const notice of notices) {
    if (notice.keyPoints || !notice.dossierUrl) {
      enriched.push(notice);
      continue;
    }
    const kept = stored.get(notice.id) ?? null;
    // A feed without dates (the FCA's) whose stored key points predate reading
    // the page's own date: read the page again once
    let keyPoints = kept && !notice.publishedAt && kept.published === undefined ? null : kept;
    if (!keyPoints && (keyPointsCache.has(notice.id) || (fetches < budget.maxFetches && Date.now() < budget.until))) {
      if (!keyPointsCache.has(notice.id)) fetches++;
      keyPoints = (await keyPointsFor(notice)) ?? kept;
    }
    keyPoints ??= kept;
    enriched.push(keyPoints ? withKeyPoints(notice, keyPoints) : notice);
  }
  return enriched;
}

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
async function archiveNotices(notices: NormalizedNotice[]) {
  if (notices.length === 0) return;
  try {
    const db = await getDb();
    if (db) await saveNotices(db, notices.map(({ archived, related, ...n }) => n));
  } catch (err: any) {
    logger.warn('[RegSonar History] Could not save notices', err);
  }
}

// Refresh a source if its cache has expired. On failure the last good notices
// are kept and the error is reported alongside them.
async function refreshSource(source: (typeof SOURCES)[number]): Promise<SourceState> {
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

async function pollSource(source: (typeof SOURCES)[number], until: number): Promise<PollResult> {
  const db = await getDb();
  let notices = await source.fetch(POLL_LIMIT);
  let stored = db ? await storedNotices(db, notices.map(n => n.id)) : new Map();
  let backfilled = false;
  if (db && notices.length >= POLL_LIMIT && stored.size === 0) {
    notices = await source.fetch(BACKFILL_LIMIT);
    stored = await storedNotices(db, notices.map(n => n.id));
    backfilled = true;
  }
  const enriched = await enrichWithKeyPoints(notices, { maxFetches: POLL_KEY_POINT_FETCHES, until });
  await archiveNotices(enriched);
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
async function backfillPageDates(until: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  let dated = 0;
  for (const stored of await undatedNotices(db, POLL_DATE_BACKFILL)) {
    if (Date.now() >= until) break;
    const notice = stored as unknown as NormalizedNotice;
    keyPointsCache.delete(notice.id);
    const keyPoints = await keyPointsFor(notice);
    const updated = keyPoints ? withKeyPoints(notice, keyPoints) : { ...notice, pageDateTried: true };
    if (updated.publishedAt) dated++;
    const { archived: _a, related: _r, ...row } = updated as NormalizedNotice & { archived?: unknown; related?: unknown };
    await saveNotices(db, [row as StoredNotice]);
  }
  return dated;
}

// Check every source and store what it lists in the history
export async function pollSources(): Promise<{ results: PollResult[]; failed: { name: string; error: string }[]; pageDatesFound: number }> {
  const db = await getDb();
  const check = { id: randomUUID(), startedAt: new Date().toISOString(), completedAt: null as string | null, status: 'running' as const, summary: null };
  const record = async (value: Parameters<typeof saveScheduledCheck>[1]) => {
    if (db) await saveScheduledCheck(db, value).catch((err: any) => logger.warn('[RegSonar Poll] Could not record check', err));
  };
  await record(check);
  try {
    const until = Date.now() + POLL_FETCH_WINDOW_MS;
    let pageDateError: string | null = null;
    const [settled, pageDatesFound] = await Promise.all([
      Promise.allSettled(SOURCES.map(s => pollSource(s, until))),
      backfillPageDates(until).catch((err: any) => {
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

async function collectDigestNotices(): Promise<{ notices: NormalizedNotice[]; failed: string[] }> {
  // The feed's own refresh first, so the check reuses its key points instead
  // of reading the same documents again
  const states = await Promise.all(SOURCES.map(refreshSource));
  const { results, failed } = await pollSources();
  const byId = new Map<string, NormalizedNotice>();
  results.forEach(r => r.notices.forEach(n => byId.set(n.id, n)));
  states.forEach(st => st.notices.forEach(n => { if (n.keyPoints || !byId.has(n.id)) byId.set(n.id, n); }));
  return { notices: dedupeByDocument([...byId.values()]), failed: failed.map(f => f.name) };
}

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

export const fromArchive = (stored: any): NormalizedNotice => {
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
async function withHistory(live: NormalizedNotice[]) {
  const db = await getDb();
  let notices = live;
  let archive: { enabled: boolean; count?: number; since?: string | null; error?: string } = { enabled: false };
  let candidates: RelatedCandidate[] = live;
  if (db) {
    try {
      const liveIds = new Set(live.map(n => n.id));
      const [recent, stats, linkable] = await Promise.all([
        recentNotices(db, ARCHIVE_FEED_DAYS, ARCHIVE_FEED_LIMIT),
        archiveStats(db),
        consultationCandidates(db)
      ]);
      notices = [...live, ...recent.filter(n => !liveIds.has(n.id)).map(fromArchive)];
      archive = { enabled: true, ...stats };
      candidates = [...linkable, ...live.filter(n => !linkable.some(c => c.id === n.id))] as RelatedCandidate[];
    } catch (err: any) {
      logger.warn('[RegSonar History] Could not read history', err);
      archive = { enabled: true, error: 'The history database could not be read' };
    }
  } else if (databaseUrl()) {
    archive = { enabled: true, error: 'The history database could not be reached' };
  }
  notices = dedupeByDocument(notices).map(n => {
    const related = findRelated(n, candidates);
    return related.length ? { ...n, related } : n;
  });
  return { notices, archive };
}

// Scheduled jobs are called by Vercel with "Authorization: Bearer <CRON_SECRET>";
// without that secret they are turned off, so nobody else can run them
function cronAuthorized(req: Request, res: Response, what: string): boolean {
  const secret = config.digest.cronSecret;
  if (!secret) {
    res.status(503).json({ success: false, error: `CRON_SECRET is not set, so ${what} turned off` });
    return false;
  }
  if (req.get('authorization') !== `Bearer ${secret}`) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

// The feed, built at most once a minute per server instance and shared by
// every request in between. Sources are re-read at most every 10 minutes
// anyway; this stops refreshes from re-reading the history database each time.
const SYNC_REUSE_MS = config.ingestion.syncReuseMs;
const currentSync = reuseFor(SYNC_REUSE_MS, async () => {
  logger.info('[RegSonar Feed Sentinel] Querying live regulatory sources...');
  const [states, endpoints] = await Promise.all([
    Promise.all(SOURCES.map(refreshSource)),
    getEndpointsHealth()
  ]);
  const sources = SOURCES.map((s, i) => ({
    endpointId: s.endpointId,
    name: s.name,
    ok: !states[i].error,
    count: states[i].notices.length,
    lastSuccessAt: states[i].lastSuccessAt,
    error: states[i].error
  }));
  const { notices, archive } = await withHistory(states.flatMap(st => st.notices));
  return { success: true, count: notices.length, lastSync: new Date().toISOString(), notices, archive, sources, endpoints };
});

// Refreshes each visitor may ask for per minute
const refreshLimit = rateLimit(config.refresh.limit, config.refresh.windowMs);

// The visitor's IP address. On Vercel, X-Forwarded-For is set by Vercel (a
// value sent by the client is replaced); elsewhere the connection's address.
function visitorIp(req: Request): string {
  const forwarded = config.runtime.isVercel ? req.get('x-forwarded-for')?.split(',')[0].trim() : undefined;
  return forwarded || req.socket.remoteAddress || 'unknown';
}

// API routes only. Used by the local server below and by the Vercel
// function in api/index.ts, where the frontend is served as static files.
export function createApp() {
  const app = express();
  // Don't announce the server software
  app.disable('x-powered-by');

  app.use(express.json());

  // Health probe route
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'RegSonar Ingestion Gateway & Sentinel',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // API Route: Get connected endpoint status and latencies
  app.get('/api/feeds/status', async (_req: Request, res: Response) => {
    try {
      const metrics = await getEndpointsHealth();
      res.json({
        success: true,
        lastChecked: new Date().toISOString(),
        totalEndpoints: metrics.length,
        operationalCount: metrics.filter(m => m.status === 'Operational').length,
        endpoints: metrics
      });
    } catch (error: any) {
      logger.error('[RegSonar] Endpoint status failed', error);
      res.status(500).json({ success: false, error: 'Endpoint status could not be loaded' });
    }
  });

  // API Route: Trigger live sync across all connected endpoints. GET responses
  // may be served from Vercel's CDN cache (up to 5 minutes old, or older while
  // a fresh copy is fetched in the background), so a cold function never makes
  // a visitor wait; lastSync says how old the data is. POST always runs.
  app.all('/api/feeds/sync', async (req: Request, res: Response) => {
    // A refresh (POST) skips the CDN cache, so each visitor may ask for only a few a minute
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const wait = refreshLimit(visitorIp(req));
      if (wait) {
        res.set({ 'Cache-Control': 'no-store', 'Retry-After': String(wait) });
        res.status(429).json({ success: false, error: `Too many refreshes. Try again in ${wait} seconds.` });
        return;
      }
    }
    try {
      const body = await currentSync();
      res.set('Cache-Control', req.method === 'GET' ? cdnCacheControl(config.cdn.sync) : 'no-store');
      res.json(body);
    } catch (error: any) {
      logger.error('[RegSonar Feed Sentinel] Sync failed', error);
      res.status(500).json({ success: false, error: 'Feed sync failed' });
    }
  });

  // Persisted scheduled-check metadata; reading this never triggers a poll.
  app.get('/api/feeds/checks', async (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    try {
      const db = await getDb();
      res.json(logger.redact(db ? { success: true, enabled: true, ...await scheduledCheckStatus(db) } : { success: true, enabled: false }));
    } catch (error) {
      logger.error('[RegSonar History] Scheduled-check status failed', error);
      res.status(503).json({ success: false, error: 'Scheduled check history is unavailable' });
    }
  });

  // Scheduled check of every source, run by the cron jobs in vercel.json
  // several times a day (needs CRON_SECRET, like the digest). It stores up to
  // 20 items per source in the history, reading further back when there is a
  // gap, and adds key points a few documents at a time. Then it asks for the
  // public feed so the cached copy visitors get is refreshed too.
  app.get('/api/feeds/poll', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    if (!cronAuthorized(req, res, 'scheduled checks are')) return;
    try {
      const { results, failed, pageDatesFound } = await pollSources();
      const added = results.reduce((sum, r) => sum + r.added, 0);
      logger.info(`[RegSonar Poll] ${added} new notices from ${results.length} sources${failed.length ? `; could not read ${failed.map(f => f.name).join(', ')}` : ''}`);
      const warmed = await fetch(`${config.digest.siteUrl}/api/feeds/sync`, { signal: AbortSignal.timeout(config.polling.warmTimeoutMs) })
        .then(r => r.ok)
        .catch(() => false);
      res.json({
        success: true,
        added,
        pageDatesFound,
        feedRefreshed: warmed,
        sources: results.map(({ notices, ...r }) => r),
        failed
      });
    } catch (error: any) {
      logger.error('[RegSonar Poll] Failed', error);
      res.status(500).json({ success: false, error: 'Scheduled check failed' });
    }
  });

  // Daily email digest, run by the cron job in vercel.json. Vercel sends
  // "Authorization: Bearer <CRON_SECRET>"; without that secret nothing runs, so
  // nobody else can trigger emails. ?dryRun=1 returns the email instead of
  // sending it, and ?date=YYYY-MM-DD picks the Singapore day (default yesterday).
  app.get('/api/digest', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    if (!cronAuthorized(req, res, 'the digest is')) return;
    try {
      const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
      const day = date || singaporeDate(new Date(), 1);
      const { notices, failed } = await collectDigestNotices();
      const matches = matchDigest(notices, DIGEST_RULES, day);
      const email = renderDigest(matches, day, config.digest.siteUrl, failed);
      const summary = { day, checked: notices.length, matched: matches.length, failedSources: failed, subject: email.subject };
      logger.info(`[RegSonar Digest] ${day}: ${matches.length} matching of ${notices.length} notices checked${failed.length ? `; could not read ${failed.join(', ')}` : ''}`);

      if (req.query.dryRun === '1') {
        res.json({ success: true, sent: false, ...summary, matches: matches.map(m => ({ id: m.notice.id, title: m.notice.title, rules: m.rules })), html: email.html, text: email.text });
        return;
      }
      if (matches.length === 0) {
        res.json({ success: true, sent: false, reason: 'No matching notices', ...summary });
        return;
      }
      const { apiKey, to, from } = config.digest;
      if (!apiKey || to.length === 0) {
        res.status(503).json({ success: false, error: 'RESEND_API_KEY and DIGEST_TO must be set to send the digest', ...summary });
        return;
      }
      const result = await sendWithResend({ apiKey, from, to, ...email });
      logger.info(`[RegSonar Digest] Sent ${day} digest (Resend id ${result.id})`);
      res.json({ success: true, sent: true, id: result.id, ...summary });
    } catch (error: any) {
      logger.error('[RegSonar Digest] Failed', error);
      res.status(500).json({ success: false, error: 'Digest failed' });
    }
  });

  // The digest's rules and whether sending is set up (never the address)
  app.get('/api/digest/rules', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      rules: DIGEST_RULES,
      schedule: 'Daily at about 08:00 Singapore time',
      configured: config.digest.configured
    });
  });

  // Search the history: titles, summaries and key points
  app.get('/api/notices/search', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    if (q.length < 2) {
      res.status(400).json({ success: false, error: 'Search needs at least 2 characters' });
      return;
    }
    try {
      const db = await getDb();
      if (!db) {
        res.json({ success: true, enabled: false, notices: [] });
        return;
      }
      const found = dedupeByDocument((await searchNotices(db, q, 40)).map(fromArchive));
      res.set('Cache-Control', cdnCacheControl(config.cdn.search));
      res.json({ success: true, enabled: true, notices: found });
    } catch (error: any) {
      logger.error('[RegSonar History] Search failed', error);
      res.status(500).json({ success: false, error: 'Search failed' });
    }
  });

  // Look up exact archived IDs for shared links and saved notices.
  app.get('/api/notices/by-id', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    let ids: unknown;
    try { ids = JSON.parse(typeof req.query.ids === 'string' ? req.query.ids : 'null'); } catch { ids = null; }
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50 ||
        !ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 240)) {
      res.status(400).json({ success: false, error: 'Provide 1 to 50 notice IDs' });
      return;
    }
    try {
      const db = await getDb();
      const found = db ? await storedNotices(db, ids) : new Map();
      res.json({ success: true, enabled: !!db, notices: [...found.values()].map(fromArchive) });
    } catch (error) {
      logger.error('[RegSonar History] Notice lookup failed', error);
      res.status(503).json({ success: false, error: 'Notice history is unavailable' });
    }
  });

  // Express's default development error handler can echo parser messages and
  // stacks (including request content). Always return a controlled JSON error.
  app.use((error: any, _req: Request, res: Response, next: NextFunction) => {
    const status = [400, 413, 415].includes(error?.status) ? error.status : 500;
    if (status < 500) logger.warn('[RegSonar] Request rejected', { status });
    else logger.error('[RegSonar] Request failed', error);
    if (res.headersSent) { next(new Error('Internal server error')); return; }
    res.status(status).json({ success: false, error: status === 400 ? 'Invalid request body' : status === 413 ? 'Request body too large' : status === 415 ? 'Unsupported request encoding' : 'Internal server error' });
  });

  return app;
}

async function startLocalServer() {
  const app = createApp();
  const { port, host, isProduction } = config.runtime;

  // Mount Vite or Static Serving
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, host, () => {
    logger.info(`[RegSonar] Server running on ${host}:${port}`);
  });
}

// On Vercel the app is imported by api/index.ts instead of listening on a
// port; tests import this file too, so it only listens when run directly
const runDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (!config.runtime.isVercel && runDirectly) {
  startLocalServer().catch((err) => {
    logger.error('[RegSonar] Fatal error starting server:', err);
    process.exit(1);
  });
}

// Key points for notices: each document is read (HTML, SFC and SGX document
// text, HKMA BRDR PDFs, the PDFs SEBI's pages show) and summarised once, or
// taken from the history.
import { logger } from './logging.js';
import { summarize } from './summarize.js';
import { extractArticleText, pagePublishedDate, extractPdfText, htmlToText } from './extract.js';
import type { KeyPoints } from '../shared/regulatory.js';
import { openStore, type StoreArg } from './store.js';
import { fetchOrThrow, describeError, readLimitedBytes } from './http.js';
import { type NormalizedNotice, tagNotice } from './notice.js';
import { fetchSgxDocText } from './sources/sgx.js';
import { withKeyPointsUntagged } from './dates.js';

// Key points per notice id. Documents don't change once published, so each is
// fetched and summarised once per server process. A failed fetch is not
// cached, so it is retried the next time its source refreshes.
export const keyPointsCache = new Map<string, KeyPoints | null>();

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
  const data = await readLimitedBytes(await fetchOrThrow(pdfUrl), MAX_PDF_BYTES);
  return { ...(await extractPdfText(data)), pdfUrl };
}

// SEBI's pages show the document in a PDF viewer ("../../../web/?file=https://
// www.sebi.gov.in/sebi_data/attachdocs/....pdf"); the page holds only its title
const SEBI_PAGE = /^https:\/\/www\.sebi\.gov\.in\//;
const SEBI_PDF_VIEWER = /<iframe[^>]+src=['"][^'"]*[?&]file=(https:\/\/www\.sebi\.gov\.in\/[^'"&#]+\.pdf)['"&#]/i;

// The PDF a SEBI page shows, if any
export const sebiPdfUrl = (pageUrl: string, html: string): string | undefined =>
  SEBI_PAGE.test(pageUrl) ? html.match(SEBI_PDF_VIEWER)?.[1] : undefined;

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

export async function keyPointsFor(notice: NormalizedNotice): Promise<KeyPoints | null> {
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
        ({ text, ocr } = await extractPdfText(await readLimitedBytes(res, MAX_PDF_BYTES)));
      } else {
        const html = await res.text();
        const pdfUrl = sebiPdfUrl(sourceUrl, html);
        if (pdfUrl) {
          ({ text, ocr } = await extractPdfText(await readLimitedBytes(await fetchOrThrow(pdfUrl), MAX_PDF_BYTES)));
          sourceUrl = pdfUrl;
        } else {
          text = extractArticleText(html, sourceUrl);
          published = pagePublishedDate(html) ?? null;
        }
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
export function withKeyPoints(notice: NormalizedNotice, keyPoints: KeyPoints): NormalizedNotice {
  return tagNotice(withKeyPointsUntagged(notice, keyPoints));
}

// Key points already in the history, so documents are read once rather than
// again by every new server instance. `known`: the stored copies, when the
// caller has already read them.
async function storedKeyPoints(notices: NormalizedNotice[], storeArg: StoreArg, known?: Map<string, { keyPoints?: KeyPoints }>): Promise<Map<string, KeyPoints>> {
  try {
    let stored = known;
    if (!stored) {
      const store = await storeArg;
      if (!store) return new Map();
      stored = await store.byIds(notices.map(n => n.id));
    }
    return new Map([...stored].flatMap(([id, n]) => (n.keyPoints ? [[id, n.keyPoints] as const] : [])));
  } catch (err: any) {
    logger.warn('[RegSonar History] Could not read stored key points', err);
    return new Map();
  }
}

// Attach key points to notices that link to a document page. Fetches run one
// at a time per source to stay polite to regulator sites. A scheduled check
// limits how many documents it reads (and until when); later checks do the rest.
export async function enrichWithKeyPoints(
  notices: NormalizedNotice[],
  budget: { maxFetches: number; until: number } = { maxFetches: Infinity, until: Infinity },
  store: StoreArg = openStore(),
  known?: Map<string, { keyPoints?: KeyPoints }>
): Promise<NormalizedNotice[]> {
  const stored = await storedKeyPoints(notices, store, known);
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

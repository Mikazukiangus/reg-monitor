import { logger } from '../../logging.js';
import { SPEECH } from '../../src/lib/tagging.js';
import { pagesFor, fetchOrThrow, describeError } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { plainText, isoDay, newestFirst, uniqueBy, zonedToIso } from '../text.js';
import { privacyNotice } from './topics.js';

// Singapore's Personal Data Protection Commission: its media and events list,
// from the listing service its page uses. Events and speeches are left out;
// "New Commission's Decision and Undertakings on …" are its enforcement
// decisions.
const PDPC_SITE = 'https://www.pdpc.gov.sg';
export const PDPC_LIST = (page: number) => `${PDPC_SITE}/api/listing-api?sort=latest&page=${page}&listingtype=media_events&itemsperpage=50&pathname=/media-events`;
const PDPC_TYPES: Record<string, string> = { 'Press Room': 'PRESS RELEASE', Advisories: 'ADVISORY', Announcements: 'ANNOUNCEMENT', Reports: 'REPORT' };

export function parsePdpcList(json: any): { id: string; title: string; date: string; type: string; url: string }[] {
  return ((json?.data ?? []) as any[]).flatMap(r => {
    const title = plainText(String(r.title ?? ''));
    const date = isoDay(String(r.date ?? ''));
    const type = PDPC_TYPES[String(r.topic)];
    if (!title || !date || !type || !r.href || SPEECH.test(title)) return [];
    return [{ id: String(r.id), title, date, type, url: new URL(String(r.href), PDPC_SITE).toString() }];
  });
}

export async function fetchPdpcNews(limit = 4): Promise<NormalizedNotice[]> {
  const pages = Array.from({ length: pagesFor(limit, 25, 3) }, (_, i) => PDPC_LIST(i + 1));
  const rows: ReturnType<typeof parsePdpcList> = [];
  for (const [i, url] of pages.entries()) {
    try {
      rows.push(...parsePdpcList(await (await fetchOrThrow(url)).json()));
    } catch (err: any) {
      if (i === 0) throw err;
      logger.info(`[RegSonar Feed Sentinel] Skipped ${url}: ${describeError(err)}`);
    }
  }
  return newestFirst(uniqueBy(rows, r => r.id)).slice(0, limit).map(r => privacyNotice({
    id: `pdpc-${r.id}`,
    ref: `PDPC ${r.date}`,
    title: r.title,
    regulator: 'PDPC',
    jurisdiction: 'SINGAPORE',
    jurisdictionCode: 'SG',
    type: r.type,
    publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Asia/Singapore'),
    url: r.url
  }));
}

import { logger } from '../logging.js';
import { mentionsPrivacy } from '../../shared/privacyTopics.js';
import { pagesFor, fetchOrThrow, describeError } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { isoDay, plainText, newestFirst, uniqueBy, zonedToIso } from '../text.js';
import { privacyNotice } from './topics.js';

// The UK's Information Commissioner's Office: news, statements and blogs (not
// speeches), from the search service its news page uses. The service is asked
// by POST for the news page's id in the site. The ICO also regulates freedom
// of information; those items are left out unless they concern personal data.
const ICO_SITE = 'https://ico.org.uk';
export const ICO_NEWS_PAGE = `${ICO_SITE}/about-the-ico/media-centre/news-and-blogs/`;
const ICO_SEARCH = `${ICO_SITE}/api/search`;
const ICO_NEWS_PAGE_ID = 2816;
const FREEDOM_OF_INFORMATION = /\bFOI\b|\bfreedom of information\b|\benvironmental information\b/i;

// "14 October 2026, News"
export function parseIcoNews(json: any): { id: string; title: string; date: string; kind: string; url: string; summary: string }[] {
  return ((json?.results ?? []) as any[]).flatMap(r => {
    const [day, kind = ''] = String(r.filterItemMetaData ?? '').split(/,\s*/);
    const date = isoDay(day);
    if (!date || !r.url || !r.title) return [];
    return [{ id: String(r.id), title: plainText(String(r.title)), date, kind: kind.trim(), url: new URL(r.url, ICO_SITE).toString(), summary: plainText(String(r.description ?? '')) }];
  });
}

export async function fetchIcoNews(limit = 4): Promise<NormalizedNotice[]> {
  const rows: ReturnType<typeof parseIcoNews> = [];
  // 25 a page; the first page must load, later ones are skipped if they fail
  for (let page = 1; page <= pagesFor(limit, 20, 3); page++) {
    const body = JSON.stringify({ filters: [], pageNumber: page, order: 'newest', rootPageId: ICO_NEWS_PAGE_ID });
    try {
      rows.push(...parseIcoNews(await (await fetchOrThrow(ICO_SEARCH, { method: 'POST', body, contentType: 'application/json' })).json()));
    } catch (err: any) {
      if (page === 1) throw err;
      logger.info(`[RegSonar Feed Sentinel] Skipped ICO news page ${page}: ${describeError(err)}`);
    }
  }
  return newestFirst(uniqueBy(rows, r => r.id))
    .filter(r => r.kind !== 'Speech' && (!FREEDOM_OF_INFORMATION.test(r.title) || mentionsPrivacy(`${r.title} ${r.summary}`)))
    .slice(0, limit)
    .map(r => privacyNotice({
      id: `ico-${r.id}`,
      ref: `ICO ${r.kind || 'News'} ${r.date}`,
      title: r.title,
      regulator: 'ICO',
      jurisdiction: 'UNITED KINGDOM',
      jurisdictionCode: 'UK_EU',
      type: (r.kind || 'News').toUpperCase(),
      publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Europe/London'),
      summary: r.summary || undefined,
      url: r.url
    }));
}

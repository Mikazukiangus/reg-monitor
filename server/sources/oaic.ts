import { mentionsPrivacy } from '../../src/lib/privacyTopics.js';
import { pagesFor, readPages } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { isoDay, plainText, newestFirst, uniqueBy, lastPathPart, zonedToIso } from '../text.js';
import { privacyNotice } from './topics.js';

// The Office of the Australian Information Commissioner: its media centre
// list (HTML). The OAIC also handles freedom of information, so only items
// about privacy or data breaches are kept. Links go through the site search's
// redirect, which holds the page's address.
const OAIC_SITE = 'https://www.oaic.gov.au';
export const OAIC_NEWS = (start: number) => `${OAIC_SITE}/news/media-centre?${new URLSearchParams({
  collection: '113e9365-ffcc-4320-a995-5c1b98bea3bb~sp-oaic-web-new', form: 'result', num_ranks: '30',
  profile: 'news-results-page', sort: 'dmetapublishedDateISO', start_rank: String(start)
})}`;

export function parseOaicNews(html: string): { url: string; title: string; date: string; tags: string[]; teaser: string }[] {
  return html.split('<div class="card">').slice(1).flatMap(chunk => {
    const link = chunk.match(/<a href="([^"]+)" class="card-title">([\s\S]*?)<\/a>/);
    const date = isoDay(plainText(chunk.match(/<p class="date">([^<]*)</)?.[1] ?? ''));
    const url = link && new URL(link[1].replace(/&amp;/g, '&'), OAIC_SITE).searchParams.get('url');
    if (!link || !date || !url?.startsWith(`${OAIC_SITE}/`)) return [];
    return [{
      url,
      title: plainText(link[2]),
      date,
      tags: [...chunk.matchAll(/<div class="tag">([^<]+)<\/div>/g)].map(m => plainText(m[1])),
      teaser: plainText(chunk.match(/<p class="card-text">([\s\S]*?)<\/p>/)?.[1] ?? '')
    }];
  });
}

export async function fetchOaicNews(limit = 4): Promise<NormalizedNotice[]> {
  const pages = Array.from({ length: pagesFor(limit, 15, 3) }, (_, i) => OAIC_NEWS(1 + i * 30));
  const rows = await readPages(pages, parseOaicNews);
  return newestFirst(uniqueBy(rows, r => r.url))
    .filter(r => mentionsPrivacy([r.title, r.teaser, ...r.tags].join(' ')))
    .slice(0, limit)
    .map(r => privacyNotice({
      id: `oaic-${lastPathPart(r.url)}`.slice(0, 120),
      ref: `OAIC ${r.tags[0] ?? 'News'} ${r.date}`,
      title: r.title,
      regulator: 'OAIC',
      jurisdiction: 'AUSTRALIA',
      jurisdictionCode: 'AU',
      type: (r.tags[0] ?? 'NEWS').toUpperCase(),
      publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Australia/Sydney'),
      summary: r.teaser || undefined,
      url: r.url
    }));
}

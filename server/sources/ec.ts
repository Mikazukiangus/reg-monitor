import { isAiRuleNews } from '../../shared/aiTopics.js';
import { pagesFor, readPages } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { isoDay, plainText, newestFirst, uniqueBy, lastPathPart, zonedToIso } from '../text.js';
import { aiNotice } from './topics.js';

// European Commission news on AI (the AI Act, its guidelines, the AI Office
// and AI Board), from the news list of the Commission's "Shaping Europe's
// digital future" site, filtered to its artificial intelligence topic. The
// site's RSS feed covers every digital topic and can't be filtered.
const EC_SITE = 'https://digital-strategy.ec.europa.eu';
export const EC_AI_NEWS = `${EC_SITE}/en/news?topic=119`;

export function parseEcNews(html: string): { kind: string; date: string; url: string; title: string; teaser: string }[] {
  return html.split('<article').slice(1).flatMap(chunk => {
    const meta = [...chunk.matchAll(/class="ecl-content-block__primary-meta-item">([^<]+)</g)].map(m => m[1].trim());
    const link = chunk.match(/class="ecl-content-block__title"><a\s+href="([^"]+)"[\s\S]*?<span>([\s\S]*?)<\/span>/);
    const date = meta.map(isoDay).find(Boolean);
    if (!link || !date) return [];
    const teaser = chunk.match(/class="ecl-content-block__description">([\s\S]*)/)?.[1] ?? '';
    return [{ kind: meta[0], date, url: new URL(link[1], EC_SITE).toString(), title: plainText(link[2]), teaser: plainText(teaser) }];
  });
}

export async function fetchEcAiNews(limit = 4): Promise<NormalizedNotice[]> {
  const pages = Array.from({ length: pagesFor(limit, 5, 4) }, (_, page) => (page ? `${EC_AI_NEWS}&page=${page}` : EC_AI_NEWS));
  const rows = await readPages(pages, parseEcNews);
  return newestFirst(uniqueBy(rows, r => r.url))
    .filter(r => isAiRuleNews(r.title, r.teaser))
    .slice(0, limit)
    .map(r => aiNotice({
      id: `ec-${lastPathPart(r.url)}`.slice(0, 120),
      ref: `European Commission · ${r.kind}`,
      title: r.title,
      regulator: 'European Commission',
      jurisdiction: 'EUROPEAN UNION',
      jurisdictionCode: 'UK_EU',
      type: r.kind.toUpperCase(),
      publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Europe/Brussels'),
      summary: r.teaser || undefined,
      url: r.url
    }));
}

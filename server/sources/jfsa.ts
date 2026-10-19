import { fetchOrThrow, xmlParser } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, toIso } from '../text.js';

// Japan Financial Services Agency English "What's New" RSS feed. Titles are
// "Category,Title". Press conference transcripts and the weekly newsletter
// are left out because they are not regulatory notices.
export const JFSA_RSS = 'https://www.fsa.go.jp/fsaEnNewsList_rss2.xml';
const JFSA_SKIPPED = /^(press conferences|international)$/i;

export async function fetchJfsaNews(limit = 4): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(JFSA_RSS);
  const parsed = xmlParser.parse(await res.text());
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items])
    .map((item: any) => {
      const raw = stripHtml(String(item.title));
      const comma = raw.indexOf(',');
      const category = comma > 0 ? raw.slice(0, comma).trim() : '';
      return { item, category, title: comma > 0 ? raw.slice(comma + 1).trim() : raw };
    })
    .filter(({ category, title }) => !JFSA_SKIPPED.test(category) && !/^FSA Weekly Review/i.test(title))
    .slice(0, limit)
    .map(({ item, category, title }) => {
      const format = formatOf(category, title);
      const sector = sectorOf(title);
      const score = estimateImpact(format);
      // Dates end in "JST", which JavaScript does not parse
      const pubDate = String(item.pubDate || '').replace(/\bJST$/, '+0900');
      const slug = String(item.link).replace(/^https?:\/\/www\.fsa\.go\.jp\/en\//, '').replace(/\.html?$/, '').replace(/[^\w-]+/g, '-');

      return {
        id: `jfsa-${slug}`,
        ref: `JFSA ${category || 'News'}`,
        title,
        regulator: 'JFSA',
        jurisdiction: 'JAPAN',
        jurisdictionCode: 'JP' as const,
        type: (category || 'NEWS').toUpperCase(),
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: getRelativeTime(pubDate),
        publishedAt: toIso(pubDate),
        tags: ['JFSA', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: String(item.link),
        isLiveFeed: true
      };
    });
}

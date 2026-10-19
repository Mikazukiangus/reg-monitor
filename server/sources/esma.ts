import { rssItems } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, lastPathPart, toIso } from '../text.js';

// European Securities and Markets Authority news (official RSS). Items have no
// pubDate; the date is in a <time datetime="..."> tag inside the description.
export const ESMA_RSS = 'https://www.esma.europa.eu/rss.xml';

export async function fetchEsmaNews(limit = 4): Promise<NormalizedNotice[]> {
  const items = await rssItems(ESMA_RSS);
  return items.slice(0, limit).map((item: any) => {
    const title = stripHtml(String(item.title));
    const html = String(item.description || '');
    const published = html.match(/datetime="([^"]+)"/)?.[1] || item.pubDate;
    const section = html.match(/field--name-field-news-section[\s\S]*?field__item">([^<]+)</)?.[1]?.trim();
    const format = formatOf(section || '', title);
    const sector = sectorOf(title + ' ' + (section || ''));
    const score = estimateImpact(format);
    const slug = lastPathPart(String(item.link));
    return {
      id: `esma-${slug}`.slice(0, 120),
      ref: `ESMA News${section ? ` · ${section}` : ''}`,
      title,
      regulator: 'ESMA',
      jurisdiction: 'EUROPEAN UNION',
      jurisdictionCode: 'UK_EU' as const,
      type: 'NEWS',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: published ? getRelativeTime(published) : 'Recently',
      publishedAt: toIso(published),
      tags: ['ESMA', format, sector, ...(section ? [section] : [])],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: String(item.link),
      isLiveFeed: true
    };
  });
}

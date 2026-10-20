import { fetchOrThrow, xmlParser } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, toIso } from '../text.js';

// Bank of England Prudential Regulation Authority publications (RSS 2.0)
export const PRA_RSS = 'https://www.bankofengland.co.uk/rss/prudential-regulation-publications';

export async function fetchPraPublications(limit = 4): Promise<NormalizedNotice[]> {
  return parsePraPublications(await (await fetchOrThrow(PRA_RSS)).text(), limit);
}

export function parsePraPublications(xml: string, limit = 4): NormalizedNotice[] {
  const parsed = xmlParser.parse(xml);
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items]).slice(0, limit).map((item: any) => {
    const title = stripHtml(String(item.title));
    const description = item.description ? stripHtml(String(item.description)) : undefined;
    const format = formatOf('', title + ' ' + (description || ''));
    const sector = sectorOf(title + ' ' + (description || ''));
    const score = estimateImpact(format);
    const slug = String(item.link).split('/').filter(Boolean).pop();

    return {
      id: `pra-${slug}`,
      ref: `PRA ${String(item.link).split('/prudential-regulation/')[1]?.split('/')[0] || 'publication'}`,
      title,
      regulator: 'UK PRA',
      jurisdiction: 'UNITED KINGDOM',
      jurisdictionCode: 'UK_EU',
      type: format.toUpperCase(),
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item.pubDate),
      publishedAt: toIso(item.pubDate),
      summary: description,
      tags: ['PRA', 'Bank of England', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: item.link,
      isLiveFeed: true
    };
  });
}

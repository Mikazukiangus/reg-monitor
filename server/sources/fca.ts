import { fetchOrThrow, xmlParser } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, toIso } from '../text.js';

// UK FCA RSS feed. The FCA site sits behind a Cloudflare bot challenge, so
// this usually fails with HTTP 403 from server environments.
export const FCA_RSS = 'https://www.fca.org.uk/news/rss.xml';

export async function fetchFcaFeed(limit = 3): Promise<NormalizedNotice[]> {
  return parseFcaFeed(await (await fetchOrThrow(FCA_RSS)).text(), limit);
}

export function parseFcaFeed(xml: string, limit = 3): NormalizedNotice[] {
  const parsed = xmlParser.parse(xml);
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];
  const slice = (Array.isArray(items) ? items : [items]).slice(0, limit);

  return slice.map((item: any) => {
    const title = String(item.title || 'FCA publication');
    const description = item.description ? stripHtml(String(item.description)) : undefined;
    const format = formatOf('', title);
    const sector = sectorOf(title + ' ' + (description || ''));
    const score = estimateImpact(format);
    const slug = String(item.link || title).split('/').filter(Boolean).pop();

    return {
      id: `fca-${slug}`,
      ref: `FCA: ${slug}`,
      title,
      regulator: 'UK FCA',
      jurisdiction: 'UNITED KINGDOM',
      jurisdictionCode: 'UK_EU',
      type: format.toUpperCase(),
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item.pubDate),
      publishedAt: toIso(item.pubDate),
      summary: description,
      tags: ['FCA', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: item.link,
      isLiveFeed: true
    };
  });
}

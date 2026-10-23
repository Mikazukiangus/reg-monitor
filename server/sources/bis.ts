import { fetchOrThrow, xmlParser } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, toIso } from '../text.js';
import { SourceError } from '../errors.js';

// BIS media releases (RSS 1.0 / RDF), which include Basel Committee announcements
export const BIS_PRESS_RSS = 'https://www.bis.org/doclist/all_pressrels.rss';

export async function fetchBisPressReleases(limit = 4): Promise<NormalizedNotice[]> {
  return parseBisPressReleases(await (await fetchOrThrow(BIS_PRESS_RSS)).text(), limit);
}

export function parseBisPressReleases(xml: string, limit = 4): NormalizedNotice[] {
  const parsed = xmlParser.parse(xml);
  const items = parsed['rdf:RDF']?.item;
  if (!items) {
    throw new SourceError('Response was not an RSS feed');
  }

  return (Array.isArray(items) ? items : [items]).slice(0, limit).map((item: any) => {
    const title = stripHtml(String(item.title));
    const description = item.description ? stripHtml(String(item.description)) : undefined;
    const format = formatOf('', title);
    const sector = sectorOf(title + ' ' + (description || ''));
    const score = estimateImpact(format);
    const slug = String(item.link).split('/').filter(Boolean).pop();
    const regulator = /basel committee/i.test(title + ' ' + (description || '')) ? 'BCBS' : 'BIS';

    return {
      id: `bis-${slug}`,
      ref: `BIS Media Release ${slug?.slice(0, 8)}`,
      title,
      regulator,
      jurisdiction: 'GLOBAL',
      jurisdictionCode: 'GLOBAL',
      type: 'MEDIA RELEASE',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item['dc:date']),
      publishedAt: toIso(item['dc:date']),
      summary: description,
      tags: [regulator, format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: item.link,
      isLiveFeed: true
    };
  });
}

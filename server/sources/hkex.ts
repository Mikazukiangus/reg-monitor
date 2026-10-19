import { rssItems } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, lastPathPart, toIso } from '../text.js';

// Hong Kong Exchanges and Clearing: regulatory announcements (disciplinary
// actions, listing consultations and conclusions) from its official RSS feed
export const HKEX_REGULATORY_RSS = 'https://www.hkex.com.hk/Services/RSS-Feeds/regulatory-announcements?sc_lang=en';

export async function fetchHkexRegulatory(limit = 4): Promise<NormalizedNotice[]> {
  const items = await rssItems(HKEX_REGULATORY_RSS);
  return items.slice(0, limit).map((item: any) => {
    const title = stripHtml(String(item.title));
    const format = /disciplinary|censure|sanction/i.test(title) ? 'Enforcement' : formatOf('', title);
    const sector = sectorOf(title);
    const score = estimateImpact(format);
    const slug = lastPathPart(String(item.link));
    return {
      id: `hkex-${slug}`,
      ref: `HKEX Regulatory Announcement ${slug.replace(/news$/, '')}`,
      title,
      regulator: 'HKEX',
      jurisdiction: 'HONG KONG',
      jurisdictionCode: 'HK' as const,
      type: format === 'Enforcement' ? 'DISCIPLINARY ACTION' : 'REGULATORY ANNOUNCEMENT',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item.pubDate),
      publishedAt: toIso(item.pubDate),
      tags: ['HKEX', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: String(item.link),
      isLiveFeed: true
    };
  });
}

import { rssItems } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, lastPathPart, toIso } from '../text.js';

// Financial Stability Board publications and press releases (official RSS).
// Meeting notices of its regional consultative groups are left out.
export const FSB_RSS = 'https://www.fsb.org/feed/';

export async function fetchFsbPublications(limit = 4): Promise<NormalizedNotice[]> {
  const items = await rssItems(FSB_RSS);
  return items
    .filter((item: any) => !/regional consultative group|report of the auditor/i.test(String(item.title)))
    .slice(0, limit)
    .map((item: any) => {
      const title = stripHtml(String(item.title));
      const description = item.description ? stripHtml(String(item.description)) : undefined;
      const format = formatOf('', title);
      const sector = sectorOf(title + ' ' + (description || ''));
      const score = estimateImpact(format);
      const slug = lastPathPart(String(item.link));
      return {
        id: `fsb-${slug}`,
        ref: `FSB ${new Date(item.pubDate).toISOString().slice(0, 10)}`,
        title,
        regulator: 'FSB',
        jurisdiction: 'GLOBAL',
        jurisdictionCode: 'GLOBAL' as const,
        type: 'PUBLICATION',
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: getRelativeTime(item.pubDate),
        publishedAt: toIso(item.pubDate),
        summary: description,
        tags: ['FSB', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: String(item.link),
        isLiveFeed: true
      };
    });
}

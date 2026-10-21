import { rssItems } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { plainText, lastPathPart, toIso } from '../text.js';

// Securities and Exchange Board of India: its one RSS feed, of regulations,
// circulars, orders, press releases and more. Appeals filed by individuals and
// recovery proceedings are left out: they make up most of the feed, and
// recovery notices give defaulters' names and tax numbers (PAN).
export const SEBI_RSS = 'https://www.sebi.gov.in/sebirss.xml';
const SEBI_SKIPPED = (link: string, title: string) => /\/recovery-proceedings\//.test(link) || /^Appeal No\b/i.test(title);

// The section of SEBI's site an item is in, from its link:
// ".../legal/circulars/oct-2026/..." -> "CIRCULARS", ".../enforcement/orders/..." -> "ENFORCEMENT ORDERS"
function sectionOf(link: string): string {
  const [, area, section] = link.match(/sebi\.gov\.in\/([^/]+)\/([^/]+)\//) ?? [];
  if (!section) return 'NEWS';
  return `${area === 'enforcement' ? 'enforcement ' : ''}${section}`.replace(/-/g, ' ').toUpperCase();
}

export async function fetchSebiNews(limit = 4): Promise<NormalizedNotice[]> {
  return (await rssItems(SEBI_RSS))
    .filter((item: any) => !SEBI_SKIPPED(String(item.link), plainText(String(item.title))))
    .slice(0, limit)
    .map((item: any) => {
      const link = String(item.link);
      const title = plainText(String(item.title));
      const description = item.description ? plainText(String(item.description)) : '';
      const summary = description && description !== title ? description : undefined;
      const type = sectionOf(link);
      const format = formatOf(type, title);
      const sector = sectorOf(`${title} ${summary || ''}`);
      const score = estimateImpact(format);
      // Dates are days in India time, written "19 Oct, 2026 +0530"
      const publishedAt = toIso(String(item.pubDate ?? '').replace(/^(\d{1,2} \w{3}), (\d{4}) /, '$1 $2 00:00 '));
      // Links end in SEBI's number for the item: ".../review-of-..._105321.html"
      const number = link.match(/_(\d+)\.html$/)?.[1];
      return {
        id: `sebi-${number ?? lastPathPart(link)}`.slice(0, 120),
        ref: `SEBI ${type.charAt(0) + type.slice(1).toLowerCase()}`,
        title,
        regulator: 'SEBI',
        jurisdiction: 'INDIA',
        jurisdictionCode: 'IN' as const,
        type,
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
        publishedAt,
        summary,
        tags: ['SEBI', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: link,
        isLiveFeed: true
      };
    });
}

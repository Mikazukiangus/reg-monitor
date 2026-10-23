import { fetchOrThrow } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, zonedToIso, lastPathPart } from '../text.js';
import { SourceError } from '../errors.js';

// Bank Negara Malaysia: press releases, from the table on each year's press
// release page. (BNM also has an Atom feed, but Cloudflare challenges
// automated requests for it, while the page itself is served normally.)
export const bnmYearPage = (year: number) => `https://www.bnm.gov.my/press-release-${year}`;
const BNM_ROW = /<td>\s*<p>\s*(\d{1,2} \w{3} \d{4})\s*<\/p>\s*<\/td>\s*<td>\s*<p>\s*<a href="([^"]+)">([\s\S]*?)<\/a>/g;

export function parseBnmPressReleases(html: string): { title: string; url: string; date: string }[] {
  const out: { title: string; url: string; date: string }[] = [];
  for (const m of html.matchAll(BNM_ROW)) {
    const date = new Date(`${m[1]} UTC`);
    if (isNaN(date.getTime())) continue;
    out.push({ title: stripHtml(m[3]), url: new URL(m[2], 'https://www.bnm.gov.my').toString(), date: date.toISOString().slice(0, 10) });
  }
  return out;
}

export async function fetchBnmPressReleases(limit = 4): Promise<NormalizedNotice[]> {
  const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric' }).format(new Date()));
  let releases = parseBnmPressReleases(await (await fetchOrThrow(bnmYearPage(year))).text());
  // Early in the year, last year's page fills the list
  if (releases.length < limit) {
    releases = releases.concat(parseBnmPressReleases(await (await fetchOrThrow(bnmYearPage(year - 1))).text()));
  }
  if (releases.length === 0) throw new SourceError('No press releases found on the BNM page');
  return releases.slice(0, limit).map(r => {
    const format = formatOf('', r.title);
    const sector = sectorOf(r.title);
    const score = estimateImpact(format);
    // Dates are Malaysian days with no time
    const publishedAt = zonedToIso(`${r.date}T00:00:00`, 'Asia/Kuala_Lumpur');
    return {
      id: `bnm-${lastPathPart(r.url)}`.slice(0, 120),
      ref: 'BNM Press Release',
      title: r.title,
      regulator: 'BNM',
      jurisdiction: 'MALAYSIA',
      jurisdictionCode: 'MY' as const,
      type: format === 'Enforcement' ? 'ENFORCEMENT ACTION' : 'PRESS RELEASE',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
      publishedAt,
      tags: ['BNM', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: r.url,
      isLiveFeed: true
    };
  });
}

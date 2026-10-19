import { htmlToText } from '../../summarize.js';
import { rssItems } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, lastPathPart, toIso } from '../text.js';

// FINRA (the US self-regulatory organisation for broker-dealers): regulatory
// and information notices from its official RSS feed. Board election notices
// are left out. Feed titles are only the notice number ("Regulatory Notice
// 26-16"), so the title adds the opening of FINRA's own summary from the feed.
// FINRA rate-limits quickly, so notice pages are only fetched for key points.
export const FINRA_NOTICES_RSS = 'https://www.finra.org/rules-guidance/notices/rss';

export function finraTitle(number: string, summary: string | undefined): string {
  const first = summary?.split(/(?<=\.)\s+(?=[A-Z])/)[0]?.replace(/\.$/, '');
  if (!first) return number;
  return `${number}: ${first.length > 150 ? `${first.slice(0, 147).replace(/\s+\S*$/, '')}...` : first}`;
}

export async function fetchFinraNotices(limit = 4): Promise<NormalizedNotice[]> {
  const items = (await rssItems(FINRA_NOTICES_RSS)).filter((item: any) => !/^election notice/i.test(String(item.title)));
  return items.slice(0, limit).map((item: any) => {
    const number = stripHtml(String(item.title));
    const link = String(item.link);
    const summary = item.description ? htmlToText(String(item.description)).replace(/^Summary\s*/i, '').trim() || undefined : undefined;
    const title = finraTitle(number, summary);
    const format = /^information notice/i.test(number) ? 'Announcements' : formatOf('', `${title} ${summary || ''}`);
    const sector = sectorOf(`${title} ${summary || ''}`);
    const score = estimateImpact(format);
    return {
      id: `finra-${lastPathPart(link)}`,
      ref: `FINRA ${number}`,
      title,
      regulator: 'FINRA',
      jurisdiction: 'UNITED STATES',
      jurisdictionCode: 'US' as const,
      type: /^regulatory notice/i.test(number) ? 'REGULATORY NOTICE' : 'NOTICE',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item.pubDate),
      publishedAt: toIso(item.pubDate),
      summary,
      tags: ['FINRA', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: link,
      isLiveFeed: true
    };
  });
}

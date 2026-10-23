import { fetchOrThrow, xmlParser } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { plainText, lastPathPart, toIso } from '../text.js';
import { SourceError } from '../errors.js';

// BaFin, Germany's Federal Financial Supervisory Authority: its English news
// feed, and its feed of measures and sanctions (fines, orders and
// prohibitions), which lists some measures the news feed leaves out. Consumer
// warnings (websites offering services without authorisation, offers without a
// prospectus) and officials' calendars are left out of the news; they make up
// most of it and are not regulatory notices.
export const BAFIN_NEWS_RSS = 'https://www.bafin.de/EN/service/rss/_function/rssnewsfeed.xml?nn=187494';
export const BAFIN_MEASURES_RSS = 'https://www.bafin.de/EN/service/rss/_function/RSS_Massnahmen.xml?nn=187494';
const BAFIN_SKIPPED = /\/EN\/(Verbrauchermitteilung|Termine_[^/]*)\//;

// The section of BaFin's site an item is in, from its link (".../EN/Massnahmen/...")
const SECTION_TYPES: Record<string, string> = {
  Massnahmen: 'MEASURES & SANCTIONS',
  Rundschreiben: 'CIRCULAR',
  Konsultationen: 'CONSULTATION',
  Pressemitteilungen: 'PRESS RELEASE'
};

export async function fetchBafinNews(limit = 4): Promise<NormalizedNotice[]> {
  return parseBafinFeed(await (await fetchOrThrow(BAFIN_NEWS_RSS)).text(), limit);
}

export async function fetchBafinMeasures(limit = 4): Promise<NormalizedNotice[]> {
  return parseBafinFeed(await (await fetchOrThrow(BAFIN_MEASURES_RSS)).text(), limit);
}

export function parseBafinFeed(xml: string, limit = 4): NormalizedNotice[] {
  const parsed = xmlParser.parse(xml);
  if (!parsed.rss?.channel) {
    throw new SourceError('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items])
    .filter((item: any) => !BAFIN_SKIPPED.test(String(item.link)))
    .slice(0, limit)
    .map((item: any) => {
      const link = String(item.link);
      // Titles and descriptions carry entities such as &#160;
      const title = plainText(String(item.title));
      const description = item.description ? plainText(String(item.description)) : '';
      const summary = description && description !== title ? description : undefined;
      const section = link.match(/\/EN\/([^/]+)\//)?.[1] ?? '';
      const type = SECTION_TYPES[section] ?? 'NEWS';
      const format = formatOf(type, title);
      const sector = sectorOf(`${title} ${summary || ''}`);
      const score = estimateImpact(format);
      return {
        id: `bafin-${lastPathPart(link)}`.slice(0, 120),
        ref: `BaFin ${type === 'NEWS' ? 'News' : type.charAt(0) + type.slice(1).toLowerCase()}`,
        title,
        regulator: 'BaFin',
        jurisdiction: 'GERMANY',
        jurisdictionCode: 'UK_EU' as const,
        type,
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: getRelativeTime(item.pubDate),
        publishedAt: toIso(item.pubDate),
        summary,
        tags: ['BaFin', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: link,
        isLiveFeed: true
      };
    });
}

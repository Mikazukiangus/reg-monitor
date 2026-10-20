import { fetchOrThrow, xmlParser } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, toIso } from '../text.js';

// Routine market-operation releases that are not regulatory notices
const HKMA_ROUTINE_RELEASE = /tender (results|information)|exchange fund (bills|notes)|government bonds?\b|institutional bonds|monetary statistics/i;

// HKMA publishes official RSS feeds on www.hkma.gov.hk. That host is served by
// a different CDN from api.hkma.gov.hk, whose Alibaba Cloud WAF times out
// requests from cloud hosts such as Vercel, so notices come from RSS.
const HKMA_RSS = 'https://www.hkma.gov.hk/eng/other-information/rss';

export interface HkmaFeed {
  file: string;
  idPrefix: string;
  refLabel: string;
  type: string;
  // Force a format for every item, otherwise classify by title
  format?: 'Consultations';
  limit: number;
}

async function fetchHkmaRss(feed: HkmaFeed, limit = feed.limit): Promise<NormalizedNotice[]> {
  return parseHkmaRss(await (await fetchOrThrow(`${HKMA_RSS}/${feed.file}`)).text(), feed, limit);
}

// The newest `limit` notices of one of HKMA's feeds, less routine market releases
export function parseHkmaRss(xml: string, feed: HkmaFeed, limit = feed.limit): NormalizedNotice[] {
  const parsed = xmlParser.parse(xml);
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items])
    .filter((item: any) => item.title && !HKMA_ROUTINE_RELEASE.test(String(item.title)))
    .slice(0, limit)
    .map((item: any) => {
      const title = stripHtml(String(item.title));
      const format = feed.format || formatOf('', title);
      const sector = sectorOf(title);
      const score = estimateImpact(format);
      // Press releases end in /20261006-4/, BRDR documents in /20260922-1-EN
      const slug = String(item.link).split('/').filter(Boolean).pop()!.replace(/-EN$/, '');

      return {
        id: `${feed.idPrefix}-${slug}`,
        ref: `${feed.refLabel} ${slug}`,
        title,
        regulator: 'HKMA',
        jurisdiction: 'HONG KONG',
        jurisdictionCode: 'HK',
        type: feed.type,
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: getRelativeTime(item.pubDate),
        publishedAt: toIso(item.pubDate),
        tags: ['HKMA', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: String(item.link),
        isLiveFeed: true
      };
    });
}

export const HKMA_FEEDS = {
  pressReleases: { file: 'rss_press-release.xml', idPrefix: 'hkma-pr', refLabel: 'HKMA Press Release', type: 'PRESS RELEASE', limit: 4 },
  circulars: { file: 'rss_circulars.xml', idPrefix: 'hkma-cir', refLabel: 'HKMA Circular', type: 'CIRCULAR', limit: 3 },
  consultations: { file: 'rss_consultations.xml', idPrefix: 'hkma-con', refLabel: 'HKMA Consultation', type: 'CONSULTATION', format: 'Consultations', limit: 3 }
} satisfies Record<string, HkmaFeed>;

export const fetchHkmaPressReleases = (limit?: number) => fetchHkmaRss(HKMA_FEEDS.pressReleases, limit);
export const fetchHkmaCirculars = (limit?: number) => fetchHkmaRss(HKMA_FEEDS.circulars, limit);
export const fetchHkmaConsultations = (limit?: number) => fetchHkmaRss(HKMA_FEEDS.consultations, limit);

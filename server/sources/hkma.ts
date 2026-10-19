import { fetchOrThrow, xmlParser } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, toIso } from '../text.js';

// Routine market-operation releases that are not regulatory notices
const HKMA_ROUTINE_RELEASE = /tender (results|information)|exchange fund (bills|notes)|government bonds?\b|institutional bonds|monetary statistics/i;

// HKMA publishes official RSS feeds on www.hkma.gov.hk. That host is served by
// a different CDN from api.hkma.gov.hk, whose Alibaba Cloud WAF times out
// requests from cloud hosts such as Vercel, so notices come from RSS.
const HKMA_RSS = 'https://www.hkma.gov.hk/eng/other-information/rss';

interface HkmaFeed {
  file: string;
  idPrefix: string;
  refLabel: string;
  type: string;
  // Force a format for every item, otherwise classify by title
  format?: 'Consultations';
  limit: number;
}

async function fetchHkmaRss(feed: HkmaFeed, limit = feed.limit): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(`${HKMA_RSS}/${feed.file}`);
  const parsed = xmlParser.parse(await res.text());
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

export const fetchHkmaPressReleases = (limit?: number) =>
  fetchHkmaRss({ file: 'rss_press-release.xml', idPrefix: 'hkma-pr', refLabel: 'HKMA Press Release', type: 'PRESS RELEASE', limit: 4 }, limit);
export const fetchHkmaCirculars = (limit?: number) =>
  fetchHkmaRss({ file: 'rss_circulars.xml', idPrefix: 'hkma-cir', refLabel: 'HKMA Circular', type: 'CIRCULAR', limit: 3 }, limit);
export const fetchHkmaConsultations = (limit?: number) =>
  fetchHkmaRss({ file: 'rss_consultations.xml', idPrefix: 'hkma-con', refLabel: 'HKMA Consultation', type: 'CONSULTATION', format: 'Consultations', limit: 3 }, limit);

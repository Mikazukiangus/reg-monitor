import { fetchOrThrow, xmlParser } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, toIso } from '../text.js';
import { SourceError } from '../errors.js';

// Hong Kong Securities and Futures Commission official RSS feeds (RSS 2.0)
export const SFC_RSS = 'https://www.sfc.hk/en/RSS-Feeds';

export interface SfcFeed {
  path: string;
  idPrefix: string;
  type: string;
  format?: 'Consultations';
  limit: number;
}

async function fetchSfcRss(feed: SfcFeed, limit = feed.limit): Promise<NormalizedNotice[]> {
  return parseSfcRss(await (await fetchOrThrow(`${SFC_RSS}/${feed.path}`)).text(), feed, limit);
}

// The newest `limit` notices of one of the SFC's feeds
export function parseSfcRss(xml: string, feed: SfcFeed, limit = feed.limit): NormalizedNotice[] {
  const parsed = xmlParser.parse(xml);
  if (!parsed.rss?.channel) {
    throw new SourceError('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items]).slice(0, limit).map((item: any) => {
    // Circular titles start with the audience on its own line ("Circular to Intermediaries")
    const title = stripHtml(String(item.title).split('\n').pop() || String(item.title));
    const refNo = String(item.guid?.['#text'] ?? item.guid ?? '').trim()
      || new URL(String(item.link)).searchParams.get('refNo')
      || title;
    const format = feed.format || formatOf('', title);
    const sector = sectorOf(title);
    const score = estimateImpact(format);

    return {
      id: `${feed.idPrefix}-${refNo}`,
      ref: `SFC ${refNo}`,
      title,
      regulator: 'SFC',
      jurisdiction: 'HONG KONG',
      jurisdictionCode: 'HK',
      type: feed.type,
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item.pubDate),
      publishedAt: toIso(item.pubDate),
      tags: ['SFC', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: String(item.link),
      isLiveFeed: true
    };
  });
}

export const SFC_FEEDS = {
  pressReleases: { path: 'Press-releases', idPrefix: 'sfc-pr', type: 'PRESS RELEASE', limit: 4 },
  circulars: { path: 'Circulars', idPrefix: 'sfc-cir', type: 'CIRCULAR', limit: 3 },
  consultations: { path: 'Consultations-and-Conclusions', idPrefix: 'sfc-con', type: 'CONSULTATION', format: 'Consultations', limit: 3 }
} satisfies Record<string, SfcFeed>;

export const fetchSfcPressReleases = (limit?: number) => fetchSfcRss(SFC_FEEDS.pressReleases, limit);
export const fetchSfcCirculars = (limit?: number) => fetchSfcRss(SFC_FEEDS.circulars, limit);
export const fetchSfcConsultations = (limit?: number) => fetchSfcRss(SFC_FEEDS.consultations, limit);

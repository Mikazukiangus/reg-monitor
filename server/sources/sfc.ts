import { fetchOrThrow, xmlParser } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, toIso } from '../text.js';

// Hong Kong Securities and Futures Commission official RSS feeds (RSS 2.0)
export const SFC_RSS = 'https://www.sfc.hk/en/RSS-Feeds';

interface SfcFeed {
  path: string;
  idPrefix: string;
  type: string;
  format?: 'Consultations';
  limit: number;
}

async function fetchSfcRss(feed: SfcFeed, limit = feed.limit): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(`${SFC_RSS}/${feed.path}`);
  const parsed = xmlParser.parse(await res.text());
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
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

export const fetchSfcPressReleases = (limit?: number) =>
  fetchSfcRss({ path: 'Press-releases', idPrefix: 'sfc-pr', type: 'PRESS RELEASE', limit: 4 }, limit);
export const fetchSfcCirculars = (limit?: number) =>
  fetchSfcRss({ path: 'Circulars', idPrefix: 'sfc-cir', type: 'CIRCULAR', limit: 3 }, limit);
export const fetchSfcConsultations = (limit?: number) =>
  fetchSfcRss({ path: 'Consultations-and-Conclusions', idPrefix: 'sfc-con', type: 'CONSULTATION', format: 'Consultations', limit: 3 }, limit);

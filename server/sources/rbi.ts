import { rssItems } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, zonedToIso } from '../text.js';
import { SourceError } from '../errors.js';

// Reserve Bank of India: its notifications (the circulars and directions it
// sends to banks and other regulated entities) and its press releases, from
// its official RSS feeds. The press releases leave out the daily market
// operations: auctions and their results, money market operations and the
// weekly money and reserve figures.
export const RBI_NOTIFICATIONS_RSS = 'https://www.rbi.org.in/notifications_rss.xml';
export const RBI_PRESS_RELEASES_RSS = 'https://www.rbi.org.in/pressreleases_rss.xml';
const MARKET_OPERATIONS = /\bauctions?\b|\bT-Bills?\b|^Treasury Bills\b|^Money Market Operations\b|^Reserve Money\b|^Money Supply\b|^Weekly Statistical Supplement\b/i;

// Dates are India time without an offset ("Mon, 19 Oct 2026 17:20:00")
function indiaTime(pubDate: unknown): string | undefined {
  const asUtc = new Date(`${String(pubDate ?? '')} GMT`);
  return isNaN(asUtc.getTime()) ? undefined : zonedToIso(asUtc.toISOString(), 'Asia/Kolkata');
}

export async function fetchRbiNotifications(limit = 4): Promise<NormalizedNotice[]> {
  return (await rssItems(RBI_NOTIFICATIONS_RSS)).slice(0, limit).map((item: any) => {
    // The notification's number opens its text: "RBI/2026-27/296 DoR.AML.REC.250/..."
    const number = stripHtml(String(item.description ?? '')).match(/^RBI\/\d{4}-\d{2}\/\d+/)?.[0];
    return rbiNotice(item, 'NOTIFICATION', 'rbi-notification', 'Id', number ? `RBI ${number}` : 'RBI Notification');
  });
}

export async function fetchRbiPressReleases(limit = 4): Promise<NormalizedNotice[]> {
  return (await rssItems(RBI_PRESS_RELEASES_RSS))
    .filter((item: any) => !MARKET_OPERATIONS.test(stripHtml(String(item.title))))
    .slice(0, limit)
    .map((item: any) => rbiNotice(item, 'PRESS RELEASE', 'rbi-pr', 'prid', 'RBI Press Release'));
}

// Each item's link names it by a number in its query (".aspx?Id=13742&Mode=0")
function rbiNotice(item: any, type: string, idPrefix: string, idParam: string, ref: string): NormalizedNotice {
  const link = String(item.link);
  const number = new URL(link).searchParams.get(idParam);
  if (!number) throw new SourceError(`No ${idParam} to name a notice by in ${link}`);
  const title = stripHtml(String(item.title));
  const format = formatOf(type, title);
  const sector = sectorOf(title);
  const score = estimateImpact(format);
  const publishedAt = indiaTime(item.pubDate);
  return {
    id: `${idPrefix}-${number}`,
    ref,
    title,
    regulator: 'RBI',
    jurisdiction: 'INDIA',
    jurisdictionCode: 'IN',
    type,
    typeColorClass: getTypeColor(format),
    impactScore: score,
    issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
    publishedAt,
    tags: ['RBI', format, sector],
    sector,
    format,
    severity: severityFor(score),
    dossierUrl: link,
    isLiveFeed: true
  };
}

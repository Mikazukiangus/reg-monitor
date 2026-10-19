import { fetchOrThrow } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, zonedToIso, lastPathPart } from '../text.js';

// Securities Commission Malaysia: media releases. The page has no feed, but
// carries its whole list as data (title, description, address, date), newest first.
export const SC_MEDIA_RELEASES = 'https://www.sc.com.my/resources/media/media-release';
const SC_RELEASE = /\{"Page Name":"((?:[^"\\]|\\.)*)","Page Description":"((?:[^"\\]|\\.)*)","Page Address":"((?:[^"\\]|\\.)*)","Display Date 2":"([^"]*)"/g;

export function parseScMediaReleases(html: string): { title: string; description: string; url: string; date: string }[] {
  const seen = new Set<string>();
  const out: { title: string; description: string; url: string; date: string }[] = [];
  for (const m of html.matchAll(SC_RELEASE)) {
    const address = JSON.parse(`"${m[3]}"`) as string;
    if (!address.startsWith('resources/media/media-release/') || seen.has(address)) continue;
    seen.add(address);
    const date = new Date(`${m[4]} UTC`);
    if (isNaN(date.getTime())) continue;
    out.push({
      title: stripHtml(JSON.parse(`"${m[1]}"`)),
      description: stripHtml(JSON.parse(`"${m[2]}"`)),
      url: `https://www.sc.com.my/${address}`,
      date: date.toISOString().slice(0, 10)
    });
  }
  return out;
}

export async function fetchScMediaReleases(limit = 4): Promise<NormalizedNotice[]> {
  const releases = parseScMediaReleases(await (await fetchOrThrow(SC_MEDIA_RELEASES)).text());
  if (releases.length === 0) throw new Error('No media releases found on the SC page');
  return releases.slice(0, limit).map(r => {
    const format = formatOf('', r.title);
    const sector = sectorOf(`${r.title} ${r.description}`);
    const score = estimateImpact(format);
    // Dates are Malaysian days with no time
    const publishedAt = zonedToIso(`${r.date}T00:00:00`, 'Asia/Kuala_Lumpur');
    return {
      id: `sc-my-${lastPathPart(r.url)}`.slice(0, 120),
      ref: 'SC Malaysia Media Release',
      title: r.title,
      regulator: 'SC Malaysia',
      jurisdiction: 'MALAYSIA',
      jurisdictionCode: 'MY' as const,
      type: format === 'Enforcement' ? 'ENFORCEMENT ACTION' : 'MEDIA RELEASE',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
      publishedAt,
      summary: r.description || undefined,
      tags: ['SC Malaysia', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: r.url,
      isLiveFeed: true
    };
  });
}

import { fetchOrThrow } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { zonedToIso, stripHtml } from '../text.js';

// ASIC has no RSS feed. Its media releases page is filled in from this JSON
// file on ASIC's own download server, which is read here in the same way.
export const ASIC_MEDIA_RELEASES = 'https://download.asic.gov.au/asic-nga/data/newsroom/newsroom-mr-latest.json';

export async function fetchAsicMediaReleases(limit = 4): Promise<NormalizedNotice[]> {
  return parseAsicMediaReleases(await (await fetchOrThrow(ASIC_MEDIA_RELEASES)).json(), limit);
}

// The newest `limit` releases in ASIC's JSON file
export function parseAsicMediaReleases(items: unknown, limit = 4): NormalizedNotice[] {
  if (!Array.isArray(items)) {
    throw new Error('ASIC media releases file was not a list');
  }

  return items
    .filter((item: any) => item.name && item.url && item.publishedDate)
    // publishedDate is Sydney local time even though it ends in "Z"
    .map((item: any) => ({ item, publishedAt: zonedToIso(String(item.publishedDate), 'Australia/Sydney') }))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, limit)
    .map(({ item, publishedAt }) => {
      const docNumber = String(item.documentNumber || '');
      const title = stripHtml(String(item.name)).replace(new RegExp(`^${docNumber}\\s+`), '');
      const summary = item.metaDescription ? stripHtml(String(item.metaDescription)) : undefined;
      const isEnforcement = Array.isArray(item.metaFunction) && item.metaFunction.includes('enforcement');
      const format = isEnforcement ? 'Enforcement' : formatOf('', title);
      const sector = sectorOf(title + ' ' + (summary || ''));
      const score = estimateImpact(format);

      return {
        id: `asic-${docNumber || item.id}`,
        ref: `ASIC ${docNumber || 'media release'}`,
        title,
        regulator: 'ASIC',
        jurisdiction: 'AUSTRALIA',
        jurisdictionCode: 'AU' as const,
        type: isEnforcement ? 'ENFORCEMENT ACTION' : 'MEDIA RELEASE',
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
        publishedAt,
        summary,
        tags: ['ASIC', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: new URL(String(item.url), 'https://asic.gov.au').toString(),
        isLiveFeed: true
      };
    });
}

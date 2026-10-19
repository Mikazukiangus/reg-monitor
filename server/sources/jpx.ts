import { htmlToText } from '../../summarize.js';
import { fetchOrThrow } from '../http.js';
import { type NormalizedNotice, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, zonedToIso } from '../text.js';

// Japan Exchange Group rule revisions: one dated table per exchange, each
// row linking to an English outline of the change (PDF)
const JPX_REVISIONS = [
  { page: 'index.html', regulator: 'TSE', name: 'Tokyo Stock Exchange' },
  { page: '01.html', regulator: 'OSE', name: 'Osaka Exchange' },
  { page: '02.html', regulator: 'JPX-R', name: 'Japan Exchange Regulation' },
  { page: '03.html', regulator: 'TOCOM', name: 'Tokyo Commodity Exchange' }
];
export const JPX_REVISIONS_BASE = 'https://www.jpx.co.jp/english/rules-participants/rules/revise/';

export function parseJpxRevisions(html: string, pageUrl: string): { date: string; title: string; outline?: string }[] {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];
  const rows: { date: string; title: string; outline?: string }[] = [];
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = row.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (cells.length < 2) continue;
    const parsed = Date.parse(`${stripHtml(cells[0]!).replace(/\./g, '')} UTC`);
    if (isNaN(parsed)) continue;
    const outline = row.match(/href="([^"]+\.pdf)"/i)?.[1];
    rows.push({
      date: new Date(parsed).toISOString().slice(0, 10),
      title: stripHtml(htmlToText(cells[1])),
      outline: outline ? new URL(outline, pageUrl).toString() : undefined
    });
  }
  return rows;
}

export async function fetchJpxRuleRevisions(limit = 4): Promise<NormalizedNotice[]> {
  const pages = await Promise.allSettled(
    JPX_REVISIONS.map(async ex => {
      const url = JPX_REVISIONS_BASE + ex.page;
      return parseJpxRevisions(await (await fetchOrThrow(url)).text(), url).map(row => ({ ...row, ex, url }));
    })
  );
  const rows = pages.flatMap(p => (p.status === 'fulfilled' ? p.value : []));
  if (rows.length === 0) throw new Error('No rule revisions could be read from JPX');
  return rows
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(row => {
      // "Enforcement Rules" is a kind of rulebook, so the title isn't used to pick the format
      const format = 'Announcements' as const;
      const sector = sectorOf(row.title);
      const score = estimateImpact(format);
      const publishedAt = zonedToIso(`${row.date}T00:00:00`, 'Asia/Tokyo');
      const slug = row.outline ? row.outline.split('/').slice(-2, -1)[0] : row.title.slice(0, 40).replace(/\W+/g, '-');
      return {
        id: `jpx-${row.ex.regulator.toLowerCase()}-${slug}`,
        ref: `${row.ex.name} rule revision ${row.date}`,
        title: row.title,
        regulator: row.ex.regulator,
        jurisdiction: 'JAPAN',
        jurisdictionCode: 'JP' as const,
        type: 'RULE REVISION',
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
        publishedAt,
        tags: ['JPX', row.ex.regulator, format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: row.outline || row.url,
        isLiveFeed: true
      };
    });
}

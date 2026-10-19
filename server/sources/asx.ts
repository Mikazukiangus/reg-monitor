import { extractClosingDate, htmlToText } from '../../summarize.js';
import { fetchOrThrow } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { stripHtml, zonedToIso, lastPathPart, closingDateFields } from '../text.js';

// ASX public consultations: a dated table on ASX's consultations page. Each
// entry says what ASX published and, for consultations, when submissions close.
export const ASX_CONSULTATIONS_PAGE = 'https://www.asx.com.au/about/regulation/consultations-and-submissions';

export function parseAsxConsultations(html: string): { date: string; text: string; links: string[] }[] {
  const start = html.search(/ASX public consultations<\/h\d>/i);
  const table = html.slice(start).match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (start < 0 || !table) return [];
  const rows: { date: string; text: string; links: string[] }[] = [];
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = row.match(/<td[\s\S]*?<\/td>/gi) || [];
    const day = cells[0] && stripHtml(cells[0]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!day || cells.length < 2) continue;
    const links = [...cells[1].matchAll(/href="([^"]+\.pdf)"/gi)].map(m => new URL(m[1], ASX_CONSULTATIONS_PAGE).toString());
    rows.push({
      date: `${day[3]}-${day[2].padStart(2, '0')}-${day[1].padStart(2, '0')}`,
      text: htmlToText(cells[1]),
      links
    });
  }
  return rows;
}

export async function fetchAsxConsultations(limit = 3): Promise<NormalizedNotice[]> {
  const rows = parseAsxConsultations(await (await fetchOrThrow(ASX_CONSULTATIONS_PAGE)).text());
  if (rows.length === 0) throw new Error('No consultation table found on the ASX page');
  return rows
    .filter(row => !/^On \w+day[^,]*,[^.]*\b(recording|webinar|briefing|forum)\b|^ASX has made available a recording/i.test(row.text))
    .slice(0, limit)
    .map((row, i) => {
    // "On Wednesday 30 September 2026, ASX published a consultation paper on ..."
    const first = row.text.split(/(?<=\.)\s+(?=[A-Z])/)[0].replace(/^On \w+day,? \d{1,2} \w+ \d{4},\s*/i, '');
    const title = first.charAt(0).toUpperCase() + first.slice(1);
    const format = formatOf('', title);
    const sector = sectorOf(row.text);
    const score = estimateImpact(format);
    const publishedAt = zonedToIso(`${row.date}T00:00:00`, 'Australia/Sydney');
    const closing = /response|feedback received/i.test(title) ? undefined : extractClosingDate(row.text.split(/(?<=[.;])\s+/));
    return {
      id: `asx-con-${row.date}-${row.links[0] ? lastPathPart(row.links[0]).slice(0, 60) : i}`,
      ref: `ASX Consultation ${row.date}`,
      title: title.length > 220 ? `${title.slice(0, 217)}...` : title,
      regulator: 'ASX',
      jurisdiction: 'AUSTRALIA',
      jurisdictionCode: 'AU' as const,
      type: 'CONSULTATION',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
      publishedAt,
      summary: row.text.length > 600 ? `${row.text.slice(0, 597)}...` : row.text,
      tags: ['ASX', format, sector],
      sector,
      format,
      severity: severityFor(score),
      // The paper itself where linked, so key points come from it
      dossierUrl: row.links[0] || ASX_CONSULTATIONS_PAGE,
      isLiveFeed: true,
      ...(closing?.date ? closingDateFields(closing.date) : {})
    };
  });
}

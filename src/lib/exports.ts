// The files the page offers: notices as CSV, JSON or a dossier text file,
// and a notice's gap checklist as CSV. Pure text; src/lib/download.ts saves it.
import type { RegulatoryNotice } from '../types/regulatory';

export function exportNotice(n: RegulatoryNotice, includeKeyPoints: boolean) {
  return {
    id: n.id, ref: n.ref, title: n.title, regulator: n.regulator,
    jurisdiction: n.jurisdiction, jurisdictionCode: n.jurisdictionCode,
    type: n.type, format: n.format, impactScore: n.impactScore, severity: n.severity,
    publishedAt: n.publishedAt, dateKind: n.statutoryDeadline?.split(':')[0],
    deadlineDate: n.deadlineDate ?? n.statutoryDeadline?.match(/\d{4}-\d{2}-\d{2}/)?.[0],
    deadlineQuote: n.deadlineQuote, sourceUrl: n.dossierUrl,
    sector: n.sector, sectors: n.sectors ?? [n.sector], tags: n.tags,
    scoreReasons: n.tagging?.impact ?? [], tagging: n.tagging,
    summary: n.summary,
    ...(includeKeyPoints && n.keyPoints ? { keyPoints: n.keyPoints } : {})
  };
}
export function csvCell(value: string | number | undefined): string {
  if (typeof value === 'number') return String(value);
  let text = value ?? '';
  // Source text must remain text when a spreadsheet opens the CSV.
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
export function buildNoticeCsv(notices: RegulatoryNotice[], includeKeyPoints = true): string {
  const headers = ['ID', 'Reference', 'Regulator', 'Jurisdiction', 'Type', 'Format', 'Impact Score', 'Severity', 'Published', 'Date Kind', 'Date in Source', 'Date Quote', 'Sectors', 'Title', 'Source URL', 'Score Reasons'];
  if (includeKeyPoints) headers.push('Quoted Key Points', 'Dated Statements', 'OCR');
  const rows = notices.map(n => {
    const e = exportNotice(n, includeKeyPoints);
    const cells: (string | number | undefined)[] = [e.id, e.ref, e.regulator, e.jurisdiction, e.type, e.format, e.impactScore, e.severity, e.publishedAt, e.dateKind, e.deadlineDate, e.deadlineQuote, e.sectors.join('; '), e.title, e.sourceUrl, e.scoreReasons.join('\n')];
    if (includeKeyPoints) cells.push(n.keyPoints?.points.join('\n'), n.keyPoints?.dates?.map(d => `${d.kind}: ${d.date} — ${d.text}`).join('\n'), n.keyPoints?.ocr ? 'Yes' : '');
    return cells.map(csvCell).join(',');
  });
  return '\uFEFF' + [headers.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n';
}

export function buildNoticeJson(notices: RegulatoryNotice[], includeKeyPoints = true): string {
  return JSON.stringify(notices.map(n => exportNotice(n, includeKeyPoints)), null, 2);
}

// "RegSonar_Statutory_Export_2026-10-19.csv"
export const exportFilename = (extension: 'csv' | 'json', now = new Date()) =>
  `RegSonar_Statutory_Export_${now.toISOString().split('T')[0]}.${extension}`;

export interface GapRow {
  requirement: string;
  owner: string;
  deadline: string;
  status: string;
  notes: string;
}

// A notice's gap checklist, with the notice and its source on comment lines
export function buildGapCsv(notice: Pick<RegulatoryNotice, 'regulator' | 'title' | 'dossierUrl'>, rows: GapRow[]): string {
  const header = `# ${notice.regulator}: ${notice.title}\r\n# Source: ${notice.dossierUrl || 'n/a'}\r\n`;
  const lines = [
    ['Requirement', 'Owner', 'Deadline', 'Status', 'Notes'],
    ...rows.map(r => [r.requirement, r.owner, r.deadline, r.status, r.notes])
  ].map(cells => cells.map(csvCell).join(','));
  return '\uFEFF' + header + lines.join('\r\n') + '\r\n';
}

// The dossier as a text file: details, then only what is quoted from the source
export function buildDossierText(notice: RegulatoryNotice, published: string, generatedAt = new Date()): string {
  const keyPoints = notice.keyPoints;
  return [
    `REGSONAR NOTICE DOSSIER`,
    ``,
    `Title: ${notice.title}`,
    `Regulator: ${notice.regulator} (${notice.jurisdiction})`,
    `Reference: ${notice.ref}`,
    `Type: ${notice.type}`,
    `Published: ${published}`,
    `Key date: ${notice.statutoryDeadline || 'None found'}${notice.deadlineQuote ? ` (from: "${notice.deadlineQuote}")` : ''}`,
    `Impact score (rubric by document kind and dates): ${notice.impactScore.toFixed(1)}/10${notice.tagging?.impact ? ` (${notice.tagging.impact.join('; ')})` : ''}`,
    `Source: ${notice.dossierUrl || 'n/a'}`,
    ``,
    ...(notice.summary ? [`SOURCE SUMMARY`, notice.summary, ``] : []),
    ...(keyPoints?.ocr ? [`NOTE: the source is a scanned PDF read by OCR; quotes may contain recognition errors.`, ``] : []),
    ...(keyPoints?.points.length ? [`KEY POINTS (quoted verbatim from the source document)`, ...keyPoints.points.map(p => `- "${p}"`), ``] : []),
    ...(keyPoints?.facts.length ? [`DATED STATEMENTS (quoted)`, ...keyPoints.facts.map(f => `- "${f.text}"`), ``] : []),
    ...(keyPoints?.refs.length ? [`REFERENCES MENTIONED`, keyPoints.refs.join(', '), ``] : []),
    `Generated ${generatedAt.toISOString()} by RegSonar from public regulator publications.`
  ].join('\n');
}

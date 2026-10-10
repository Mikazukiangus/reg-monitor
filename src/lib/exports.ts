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
function csvCell(value: string | number | undefined): string {
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

// iCalendar (.ics) export of dates found in notices, as all-day events that
// Outlook, Google Calendar and Apple Calendar can import.
import { RegulatoryNotice } from '../types/regulatory';
import { daysUntil } from './derived';

function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// Lines longer than 75 octets are folded onto continuation lines (RFC 5545 3.1)
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (size + n > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += n;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (iso: string) => iso.replace(/-/g, '');

function nextDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// Notices with a date today or later
export function calendarNotices(notices: RegulatoryNotice[]): RegulatoryNotice[] {
  return notices.filter(n => n.deadlineDate && daysUntil(n.deadlineDate) >= 0);
}

export function buildIcs(notices: RegulatoryNotice[], now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const events = calendarNotices(notices).map(n => {
    const what = n.statutoryDeadline?.replace(/:\s*\d{4}-\d{2}-\d{2}$/, '') || 'Key date';
    const description = [
      `${what}: ${n.deadlineDate} (as stated in the source; check the document before relying on it).`,
      `${n.regulator} · ${n.ref}`,
      n.dossierUrl ? `Source: ${n.dossierUrl}` : ''
    ].filter(Boolean).join('\n');
    return [
      'BEGIN:VEVENT',
      `UID:${n.id}@regsonar`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(n.deadlineDate!)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDay(n.deadlineDate!))}`,
      `SUMMARY:${escapeText(`${n.regulator}: ${what} – ${n.title}`)}`,
      `DESCRIPTION:${escapeText(description)}`,
      ...(n.dossierUrl ? [`URL:${n.dossierUrl}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT'
    ];
  });
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//RegSonar//Regulatory dates//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flat(),
    'END:VCALENDAR'
  ].map(fold).join('\r\n') + '\r\n';
}

export function downloadIcs(notices: RegulatoryNotice[], filename: string) {
  const blob = new Blob([buildIcs(notices)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

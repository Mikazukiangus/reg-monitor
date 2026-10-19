// Text and date helpers shared by the source adapters: HTML to plain text,
// local dates to ISO timestamps, and sorting and de-duplicating list rows.
import { htmlToText } from '../summarize.js';
import type { NormalizedNotice } from './notice.js';

export function toIso(dateString: string | undefined): string | undefined {
  if (!dateString) return undefined;
  const t = new Date(dateString).getTime();
  return isNaN(t) ? undefined : new Date(t).toISOString();
}

export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Convert a local date-time without offset ("2026-10-07T11:13:00") in the
// given time zone to an ISO timestamp
export function zonedToIso(local: string, timeZone: string): string | undefined {
  const asUtc = new Date(`${local.slice(0, 19)}Z`).getTime();
  if (isNaN(asUtc)) return undefined;
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(asUtc))
    .find(p => p.type === 'timeZoneName')?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMs = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) * 60_000 : 0;
  return new Date(asUtc - offsetMs).toISOString();
}

export const lastPathPart = (url: string) => new URL(url).pathname.split('/').filter(Boolean).pop()!.replace(/\.\w+$/, '');

// "Comments close" or "Comments closed" fields for a closing date (YYYY-MM-DD)
// that the source publishes
export function closingDateFields(date: string): Partial<NormalizedNotice> {
  if (date < hongKongDate()) {
    return { statutoryDeadline: `Comments closed: ${date}`, statusBadge: { text: `Comments closed: ${date}`, type: 'standard' } };
  }
  return {
    deadlineDate: date,
    statutoryDeadline: `Comments close: ${date}`,
    statusBadge: { text: `Comments close: ${date}`, type: 'deadline' }
  };
}

export const singaporeDay = (unixSeconds: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date(unixSeconds * 1000));

// Plain text of a fragment of HTML, with its entities decoded
export const plainText = (html: string) => stripHtml(htmlToText(html));

// "06 October 2026", "Oct 8, 2026" -> 2026-10-08
export function isoDay(text: string): string | undefined {
  if (!/^(\d{1,2} [A-Z][a-z]+ \d{4}|[A-Z][a-z]+ \d{1,2}, \d{4})$/.test(text.trim())) return undefined;
  const t = Date.parse(`${text.trim()} 12:00 UTC`);
  return isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

export const newestFirst = <T extends { date: string }>(rows: T[]) => rows.sort((a, b) => b.date.localeCompare(a.date));
export const uniqueBy = <T>(rows: T[], key: (row: T) => string) => {
  const seen = new Set<string>();
  return rows.filter(r => !seen.has(key(r)) && !!seen.add(key(r)));
};

// Today's date in Hong Kong, YYYY-MM-DD
export function hongKongDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(new Date());
}

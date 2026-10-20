// Upcoming dates for the Regulatory Horizon: each notice's deadline that is
// still ahead, with the sentence from the source that names it, by quarter
// and by month. Pure, so it is tested without the page.
import type { RegulatoryNotice } from '../../shared/regulatory';
import { daysUntil } from '../../shared/derived';

export interface HorizonEvent {
  notice: RegulatoryNotice;
  date: string;
  quarter: string;
  days: number;
  // Sentence from the source that names this date, when there is one
  quote?: string;
}

export function quarterOf(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  return `Q${Math.ceil(m / 3)} ${y}`;
}

// Parts of a date for the phone agenda: "16", "Fri", "October 2026"
export function dateParts(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return {
    day: d,
    weekday: date.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }),
    month: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  };
}

// Dates from today on, soonest first
export function horizonEvents(notices: RegulatoryNotice[], now = new Date()): HorizonEvent[] {
  return notices
    .filter(n => n.deadlineDate && daysUntil(n.deadlineDate, now) >= 0)
    .map(n => ({
      notice: n,
      date: n.deadlineDate!,
      quarter: quarterOf(n.deadlineDate!),
      days: daysUntil(n.deadlineDate!, now),
      quote: n.deadlineQuote ?? n.keyPoints?.facts.find(f => f.date === n.deadlineDate)?.text
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// Phones group the dates by month, like a calendar's schedule view
export function byMonth(events: HorizonEvent[]): { month: string; events: HorizonEvent[] }[] {
  const months: { month: string; events: HorizonEvent[] }[] = [];
  for (const e of events) {
    const month = dateParts(e.date).month;
    if (months[months.length - 1]?.month !== month) months.push({ month, events: [] });
    months[months.length - 1].events.push(e);
  }
  return months;
}

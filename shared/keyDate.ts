// The date a notice shows (comments close, takes effect, comply by), worked
// out from the dates it has and today, in one place for the server, the
// screens, the email digest, calendar files and exports. Notices store only
// the dates themselves: those the regulator publishes (sourceDates) and those
// its document states (keyPoints.dates). Which one is shown, and whether it
// has passed, changes from day to day, so it is never stored.
import type { DateKind, DocumentDate, InstrumentFormat, KeyPoints, SourceDate } from './regulatory';

// Who gives the date: the regulator, with the notice, or the document's text
export type DateSource = 'regulator' | 'document';

export interface KeyDate {
  kind: DateKind;
  // ISO date (YYYY-MM-DD)
  date: string;
  // "Comments close", "Comments closed", "Takes effect", "Took effect", "Comply by"
  label: string;
  // What the notice shows: "Comments close: 2026-11-05", "Comply by: 2026-10-01 (passed)"
  text: string;
  upcoming: boolean;
  badge: 'deadline' | 'action' | 'standard';
  // The sentence it comes from, when the document states it
  quote?: string;
  from: DateSource;
}

// What keyDate reads of a notice; older copies may have the fields below instead of sourceDates
export interface DatedNotice {
  type: string;
  title: string;
  format: InstrumentFormat;
  sourceDates?: SourceDate[];
  keyPoints?: Pick<KeyPoints, 'dates' | 'closingDate'>;
  statutoryDeadline?: string;
  deadlineQuote?: string;
}

// The fields copies saved before 21 October 2026 have instead of sourceDates
export const LEGACY_DATE_FIELDS = ['statutoryDeadline', 'deadlineDate', 'deadlineQuote', 'statusBadge'] as const;

const LABELS: Record<DateKind, [upcoming: string, passed: string]> = {
  closes: ['Comments close', 'Comments closed'],
  takesEffect: ['Takes effect', 'Took effect'],
  complyBy: ['Comply by', 'Comply by']
};

// Round-ups quote the dates of the papers they list
const ROUND_UP = /\b(?:digest|newsletter|bulletin|round-?up)\b/i;

// Today's date in Hong Kong (YYYY-MM-DD), the day the site's dates turn on
export function hongKongDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(now);
}

// The dates the regulator published. Older copies have them only as a label,
// "Comments close: 2026-11-05" or the Federal Register's "Effective: ...";
// a label taken from the document's text (it has a quote, or says "Date in
// source", or repeats the legacy closingDate of a notice that is not a
// consultation) is not the regulator's.
export function sourceDatesOf(n: DatedNotice): SourceDate[] {
  if (n.sourceDates) return n.sourceDates;
  const label = n.statutoryDeadline;
  if (!label || n.deadlineQuote) return [];
  const m = label.match(/^(Comments closed?|Effective|Takes effect|Comply by): (\d{4}-\d{2}-\d{2})/);
  if (!m) return [];
  const kind: DateKind = m[1].startsWith('Comments') ? 'closes' : m[1] === 'Comply by' ? 'complyBy' : 'takesEffect';
  if (kind === 'closes' && m[2] === n.keyPoints?.closingDate?.date && n.format !== 'Consultations') return [];
  return [{ kind, date: m[2] }];
}

function shown(d: { kind: DateKind; date: string }, upcoming: boolean, from: DateSource, quote?: string): KeyDate {
  const label = LABELS[d.kind][upcoming ? 0 : 1];
  const passed = !upcoming && d.kind === 'complyBy' ? ' (passed)' : '';
  const badge = !upcoming ? 'standard' : d.kind === 'takesEffect' ? 'action' : 'deadline';
  return { kind: d.kind, date: d.date, label, text: `${label}: ${d.date}${passed}`, upcoming, badge, ...(quote ? { quote } : {}), from };
}

// The date a notice shows, chosen from the regulator's dates if it published
// any, else from the dates its document states:
// - when comments close, if they are still open (for a document, only a
//   closing date for this paper: the notice is a consultation or the sentence
//   asks for comments, rather than a digest quoting another paper's)
// - else the soonest date it takes effect or must be complied with, except on
//   consultations (where those dates are only proposed) and enforcement actions
// - else a closing date that has passed ("Comments closed")
// - else, for the regulator's own dates, the latest that has passed ("Took effect")
// A round-up's document dates belong to the papers it lists, so it shows none.
export function keyDate(n: DatedNotice, today = hongKongDate()): KeyDate | undefined {
  const own = sourceDatesOf(n);
  const from: DateSource = own.length ? 'regulator' : 'document';
  if (from === 'document' && ROUND_UP.test(n.title)) return undefined;
  const dates: (SourceDate & Partial<Pick<DocumentDate, 'text' | 'general'>>)[] = own.length ? own : n.keyPoints?.dates ?? [];
  const proposedOnly = n.format === 'Consultations' || n.format === 'Enforcement';
  const closes = dates.find(d => d.kind === 'closes' && (!d.general || n.format === 'Consultations'));
  if (closes && closes.date >= today) return shown(closes, true, from, closes.text);
  const next = proposedOnly ? undefined
    : dates.filter(d => d.kind !== 'closes' && d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next) return shown(next, true, from, next.text);
  if (closes) return shown(closes, false, from, closes.text);
  if (from === 'regulator' && !proposedOnly) {
    const last = dates.filter(d => d.kind !== 'closes').sort((a, b) => b.date.localeCompare(a.date))[0];
    if (last) return shown(last, false, from);
  }
  return undefined;
}

// A notice as stored before 21 October 2026, with its regulator's dates as
// sourceDates and without the fields that held the date shown
export function withoutLegacyDateFields<T extends DatedNotice>(n: T): Omit<T, (typeof LEGACY_DATE_FIELDS)[number]> {
  const hadLegacy = LEGACY_DATE_FIELDS.some(f => f in n);
  if (!hadLegacy) return n;
  const sourceDates = sourceDatesOf(n);
  const rest: any = { ...n };
  for (const f of LEGACY_DATE_FIELDS) delete rest[f];
  return { ...rest, ...(sourceDates.length ? { sourceDates } : {}) };
}

// The date a notice shows, when it is still ahead
export function upcomingDate(n: DatedNotice, today = hongKongDate()): KeyDate | undefined {
  const shownDate = keyDate(n, today);
  return shownDate?.upcoming ? shownDate : undefined;
}

// The date a notice shows (comments close, takes effect, comply by), chosen
// from the dates its document states for itself.
import { documentDates } from '../summarize.js';
import type { KeyPoints, DocumentDate, DateKind } from '../src/types/regulatory.js';
import { type NormalizedNotice, formatOf, getRelativeTime } from './notice.js';
import { hongKongDate, toIso } from './text.js';

export const NO_DATE = 'No date published';
const DATE_LABELS: Record<DateKind, string> = { closes: 'Comments close', takesEffect: 'Takes effect', complyBy: 'Comply by' };
// Round-ups quote the dates of the papers they list
const ROUND_UP = /\b(?:digest|newsletter|bulletin|round-?up)\b/i;

// The date a notice shows, chosen from the dates its document states for itself:
// - when comments close, if the document asks for comments or the notice is a
//   consultation (a digest or event notice may give another paper's closing date)
// - else the soonest date it takes effect or must be complied with, except on
//   consultations (where those dates are only proposed) and enforcement actions
// - else a closing date that has passed, as "Comments closed"
// A round-up's dates belong to the papers it lists, so it shows none.
export function noticeDate(notice: { type: string; title: string }, dates: DocumentDate[], today = hongKongDate()): Partial<NormalizedNotice> | undefined {
  if (ROUND_UP.test(notice.title)) return undefined;
  const format = formatOf(notice.type, notice.title);
  const closes = dates.find(d => d.kind === 'closes' && (!d.general || format === 'Consultations'));
  const next = closes && closes.date >= today ? closes
    : format === 'Consultations' || format === 'Enforcement' ? undefined
    : dates.filter(d => d.kind !== 'closes' && d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next) {
    const text = `${DATE_LABELS[next.kind]}: ${next.date}`;
    return { deadlineDate: next.date, statutoryDeadline: text, deadlineQuote: next.text, statusBadge: { text, type: next.kind === 'takesEffect' ? 'action' : 'deadline' } };
  }
  if (closes) {
    const text = `Comments closed: ${closes.date}`;
    return { statutoryDeadline: text, deadlineQuote: closes.text, statusBadge: { text, type: 'standard' } };
  }
  return undefined;
}

// Sentences of the key points that can state a date: those found by the
// current rules and, in copies stored before them, the closing and dated sentences
const dateSentences = (keyPoints: KeyPoints): string[] => [
  ...(keyPoints.dates || []).map(d => d.text),
  ...(keyPoints.closingDate ? [keyPoints.closingDate.text] : []),
  ...keyPoints.facts.map(f => f.text)
];

export function withKeyPointsUntagged(notice: NormalizedNotice, keyPoints: KeyPoints): NormalizedNotice {
  // Worked out again from the sentences each time, so a rule change reaches stored copies
  const dates = documentDates(dateSentences(keyPoints));
  const { closingDate: _legacy, dates: _previous, ...rest } = keyPoints;
  // Dates the source itself gives (Federal Register, MAS and SGX consultations) are kept
  const own = !notice.deadlineDate && (!notice.statutoryDeadline || notice.statutoryDeadline === NO_DATE);
  // A feed that gives no date (the FCA's) takes the date the page states
  const published = !notice.publishedAt && keyPoints.published ? toIso(keyPoints.published) : undefined;
  return {
    ...notice,
    ...(published ? { publishedAt: published, issuedTimeAgo: getRelativeTime(published) } : {}),
    keyPoints: { ...rest, ...(dates.length ? { dates } : {}) },
    ...(own ? noticeDate(notice, dates) : {})
  };
}

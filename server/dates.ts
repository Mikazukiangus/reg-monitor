// The dates a notice's document states for itself (comments close, takes
// effect, comply by), and its publication date when the feed gives none. The
// date a notice shows is worked out from these when it is read
// (shared/keyDate.ts). Every date a notice has is also stored in the
// history's notice_dates table, for queries in SQL.
import { documentDates } from './document-dates.js';
import type { KeyPoints } from '../shared/regulatory.js';
import { sourceDatesOf, type DatedNotice } from '../shared/keyDate.js';
import { type NormalizedNotice, formatOf, getRelativeTime } from './notice.js';
import type { DateRow, NoticeStore } from './store.js';
import { toIso, uniqueBy } from './text.js';

// Sentences of the key points that can state a date: those found by the
// current rules and, in copies stored before them, the closing and dated sentences
const dateSentences = (keyPoints: Partial<KeyPoints>): string[] => [
  ...(keyPoints.dates || []).map(d => d.text),
  ...(keyPoints.closingDate ? [keyPoints.closingDate.text] : []),
  ...(keyPoints.facts || []).map(f => f.text)
];

export function withKeyPointsUntagged(notice: NormalizedNotice, keyPoints: KeyPoints): NormalizedNotice {
  // Worked out again from the sentences each time, so a rule change reaches stored copies
  const dates = documentDates(dateSentences(keyPoints));
  const { closingDate: _legacy, dates: _previous, ...rest } = keyPoints;
  // A feed that gives no date (the FCA's) takes the date the page states
  const published = !notice.publishedAt && keyPoints.published ? toIso(keyPoints.published) : undefined;
  return {
    ...notice,
    ...(published ? { publishedAt: published, issuedTimeAgo: getRelativeTime(published) } : {}),
    keyPoints: { ...rest, ...(dates.length ? { dates } : {}) }
  };
}

// What noticeDates reads of a notice, new or stored by an older version
export type DateFields = { id: string; keyPoints?: Partial<KeyPoints> } & Omit<DatedNotice, 'format' | 'keyPoints'>;

// Every date a notice has, as notice_dates holds them: those its regulator
// published (sourceDates) and those its document states, worked out again
// from the sentences as when it is read
export function noticeDates(n: DateFields): DateRow[] {
  const keyPoints = n.keyPoints ?? {};
  const regulator = sourceDatesOf({ ...n, format: formatOf(n.type, n.title), keyPoints }).map(d =>
    ({ noticeId: n.id, source: 'regulator' as const, kind: d.kind, date: d.date, general: false }));
  const document = documentDates(dateSentences(keyPoints)).map(d =>
    ({ noticeId: n.id, source: 'document' as const, kind: d.kind, date: d.date, general: !!d.general, quote: d.text }));
  // A date stated twice is stored once, with the first sentence that states it
  return uniqueBy([...regulator, ...document], d => `${d.source} ${d.kind} ${d.date}`);
}

// Store the dates of notices just saved
// (under the dates lock, so a rebuild running now does not undo them)
export async function saveDates(notices: DateFields[], store: NoticeStore): Promise<void> {
  await store.exclusive('dates', s => s.replaceDates(notices.flatMap(noticeDates), notices.map(n => n.id)));
}

// Work out every stored notice's dates again and store exactly those, so a
// change to the rules reaches the whole history; returns how many
// The notices are read and their dates replaced under the dates lock, so
// dates saved for a notice meanwhile wait and are written after, not deleted
export async function rebuildDates(store: NoticeStore): Promise<number> {
  return store.exclusive('dates', async s => {
    const dates = (await s.dateFields()).flatMap(noticeDates);
    await s.replaceDates(dates);
    return dates.length;
  });
}

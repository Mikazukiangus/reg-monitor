// The dates a notice's document states for itself (comments close, takes
// effect, comply by), and its publication date when the feed gives none. The
// date a notice shows is worked out from these when it is read
// (shared/keyDate.ts).
import { documentDates } from './document-dates.js';
import type { KeyPoints } from '../shared/regulatory.js';
import { type NormalizedNotice, getRelativeTime } from './notice.js';
import { toIso } from './text.js';

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
  // A feed that gives no date (the FCA's) takes the date the page states
  const published = !notice.publishedAt && keyPoints.published ? toIso(keyPoints.published) : undefined;
  return {
    ...notice,
    ...(published ? { publishedAt: published, issuedTimeAgo: getRelativeTime(published) } : {}),
    keyPoints: { ...rest, ...(dates.length ? { dates } : {}) }
  };
}

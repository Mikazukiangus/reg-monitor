// A notice's dates in order, for the dossier's timeline: when it and any
// linked consultation or conclusions were published, and the dates its own
// text states (comments close, takes effect, comply by). Nothing is
// estimated; a date appears only when the feed or the document gives it.
import type { DocumentDate, RegulatoryNotice } from '../types/regulatory';
import { publishedDay } from './derived';

export interface TimelineStep {
  label: string;
  // YYYY-MM-DD
  date: string;
  // The sentence the date was read from
  quote?: string;
  // A linked notice: the consultation this follows, or its conclusions
  relatedId?: string;
  relatedTitle?: string;
  relatedUrl?: string;
}

const KIND_LABEL: Record<DocumentDate['kind'], string> = {
  closes: 'Comments close',
  takesEffect: 'Takes effect',
  complyBy: 'Comply by'
};

const isoDay = (value?: string) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : undefined);

type TimelineNotice = Pick<RegulatoryNotice, 'publishedAt' | 'jurisdictionCode' | 'keyPoints' | 'deadlineDate' | 'deadlineQuote' | 'statutoryDeadline' | 'related'>;

export function noticeTimeline(notice: TimelineNotice): TimelineStep[] {
  const steps: TimelineStep[] = [];
  const add = (step: TimelineStep) => {
    if (!steps.some(s => s.label === step.label && s.date === step.date)) steps.push(step);
  };
  const related = (relation: 'consultation' | 'conclusion', label: string) => {
    for (const r of notice.related ?? []) {
      const date = r.relation === relation ? publishedDay(r.publishedAt, notice.jurisdictionCode) : undefined;
      if (date) add({ label, date, relatedId: r.id, relatedTitle: r.title, relatedUrl: r.dossierUrl });
    }
  };

  related('consultation', 'Consultation published');
  const published = publishedDay(notice.publishedAt, notice.jurisdictionCode);
  if (published) add({ label: 'Published', date: published });
  // Dates the document states for itself; a closing date it mentions for
  // something else ("general") stays among the dated statements only
  for (const d of notice.keyPoints?.dates ?? []) {
    if (!d.general) add({ label: KIND_LABEL[d.kind], date: d.date, quote: d.text });
  }
  const deadline = isoDay(notice.deadlineDate);
  if (deadline && !steps.some(s => s.date === deadline && s.label !== 'Published')) {
    add({ label: notice.statutoryDeadline?.replace(/:.*$/, '').trim() || 'Key date', date: deadline, quote: notice.deadlineQuote });
  }
  related('conclusion', 'Conclusions published');

  // Stable sort keeps "Published" ahead of a date stated for the same day
  return steps.map((s, i) => ({ s, i })).sort((a, b) => a.s.date.localeCompare(b.s.date) || a.i - b.i).map(x => x.s);
}

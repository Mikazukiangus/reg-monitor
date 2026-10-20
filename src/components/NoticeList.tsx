import React from 'react';
import { InstrumentFormat, RegulatoryNotice } from '../../shared/regulatory';
import { daysUntil, formatDate, publishedDay } from '../../shared/derived';
import { CRITICAL_SCORE, HIGH_SCORE } from '../../shared/impact';
import { Highlight } from './Highlight';

interface NoticeListProps {
  notices: RegulatoryNotice[];
  isNew: (notice: RegulatoryNotice) => boolean;
  bookmarkedIds: Set<string>;
  onOpen: (notice: RegulatoryNotice) => void;
  onToggleBookmark: (id: string) => void;
  highlight?: string[];
}

const FORMAT_TEXT: Partial<Record<InstrumentFormat, string>> = {
  Consultations: 'text-blue',
  Enforcement: 'text-orange',
  Guidelines: 'text-green'
};

const scoreTone = (score: number) =>
  score >= CRITICAL_SCORE ? 'bg-orange-fill border-orange-fill text-on-orange'
    : score >= HIGH_SCORE ? 'bg-cream-tint border-cream-line text-cream'
    : 'bg-panel-raised border-line text-ink-soft';

// "16 Oct", the day the regulator dates it
const shortDate = (notice: RegulatoryNotice) => {
  const day = publishedDay(notice.publishedAt, notice.jurisdictionCode);
  return day ? formatDate(day).replace(/ \d{4}$/, '') : '';
};

// One line per notice, for scanning many at once (like a reader's title-only
// view): date, regulator, kind, the next date it states, title and score.
// The whole row opens the dossier.
export const NoticeList: React.FC<NoticeListProps> = ({ notices, isNew, bookmarkedIds, onOpen, onToggleBookmark, highlight }) => (
  <ul aria-label="Notices" className="bg-panel border border-line rounded-lg shadow-xs divide-y divide-line overflow-hidden">
    {notices.map(n => {
      const days = n.deadlineDate ? daysUntil(n.deadlineDate) : -1;
      const tone = days <= 14 ? 'text-orange' : days <= 60 ? 'text-cream' : 'text-accent';
      const saved = bookmarkedIds.has(n.id);
      const date = shortDate(n);
      return (
        <li key={n.id} className="relative flex items-start gap-3 px-3 py-2.5 hover:bg-panel-raised transition-colors">
          <span className="max-sm:hidden w-12 shrink-0 pt-px font-['JetBrains_Mono'] text-[11px] text-muted" title={n.issuedTimeAgo}>{date}</span>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-['JetBrains_Mono'] text-[10px]">
              {isNew(n) && (
                <span className="flex items-center gap-1 font-bold text-accent" title="Not seen in this browser before">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />NEW
                </span>
              )}
              <span className="font-bold text-ink">{n.regulator}</span>
              <span className={`uppercase tracking-wider ${FORMAT_TEXT[n.format] ?? 'text-ink-soft'}`}>{n.format}</span>
              {days >= 0 && (
                <span className={`font-bold ${tone}`}>
                  {n.statutoryDeadline?.replace(/:.*$/, '') || 'Key date'} {days === 0 ? 'today' : `in ${days}d`}
                </span>
              )}
              <span className="sm:hidden text-muted">{date || n.issuedTimeAgo}</span>
            </div>
            {/* Stretched over the row, so the row is one target */}
            <button
              onClick={() => onOpen(n)}
              className="mt-0.5 w-full text-left font-['Inter'] text-[13px] leading-snug font-semibold text-ink hover:text-accent line-clamp-2 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-accent"
            >
              <span lang={n.language}><Highlight text={n.title} terms={highlight} /></span>
            </button>
          </div>
          <span
            className={`relative shrink-0 mt-px px-1.5 py-0.5 rounded border font-['JetBrains_Mono'] text-[10px] font-bold ${scoreTone(n.impactScore)}`}
            title="Impact score: a rubric by document kind and dates, not a legal assessment"
          >
            <span className="sr-only">Impact </span>{n.impactScore.toFixed(1)}
          </span>
          <button
            onClick={() => onToggleBookmark(n.id)}
            aria-pressed={saved}
            aria-label={`Save: ${n.title}`}
            className={`relative z-10 shrink-0 -my-1.5 -mr-1.5 w-9 h-9 flex items-center justify-center rounded transition-colors ${saved ? 'text-accent' : 'text-muted hover:text-ink'}`}
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">{saved ? 'bookmark_added' : 'bookmark'}</span>
          </button>
        </li>
      );
    })}
  </ul>
);

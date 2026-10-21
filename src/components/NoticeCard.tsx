import React from 'react';
import { InstrumentFormat, RegulatoryNotice } from '../../shared/regulatory';
import { daysUntil, formatDate, publishedDay } from '../../shared/derived';
import { keyDate } from '../../shared/keyDate';
import { CRITICAL_SCORE, HIGH_SCORE } from '../../shared/impact';
import { Highlight } from './Highlight';

interface NoticeCardProps {
  notice: RegulatoryNotice;
  onOpenGapAnalysis: (notice: RegulatoryNotice) => void;
  onOpenPdfDossier: (notice: RegulatoryNotice) => void;
  onToggleBookmark: (id: string) => void;
  isBookmarked: boolean;
  // Not seen in this browser before
  isNew?: boolean;
  onCopyLink?: (notice: RegulatoryNotice) => void;
  onAddToCalendar?: (notice: RegulatoryNotice) => void;
  // Words to mark, from the search box
  highlight?: string[];
  // Open a related notice (consultation or conclusions) by id
  onOpenRelated?: (id: string, url?: string) => void;
}

// Type badge colours by format, from the theme so they follow light and dark.
// Notices still carry the server's fixed typeColorClass, which this replaces.
const FORMAT_BADGE: Partial<Record<InstrumentFormat, string>> = {
  Consultations: 'bg-blue-tint border-blue-line text-blue',
  Enforcement: 'bg-orange-wash border-orange-line text-orange',
  Guidelines: 'bg-green-wash border-green-line text-green',
  'Technical Standards': 'bg-wash border-line text-ink-soft'
};
const DEFAULT_BADGE = 'bg-panel border-accent-line text-accent';

const NewBadge = () => (
  <span className="px-1.5 py-0.5 rounded bg-accent text-on-accent font-['JetBrains_Mono'] text-[9px] font-bold uppercase tracking-wider" title="Not seen in this browser before">
    New
  </span>
);

export const NoticeCard: React.FC<NoticeCardProps> = ({
  notice,
  onOpenGapAnalysis,
  onOpenPdfDossier,
  onToggleBookmark,
  isBookmarked,
  isNew = false,
  onCopyLink,
  onAddToCalendar,
  highlight,
  onOpenRelated
}) => {
  // The date the notice shows, worked out from its dates and today (shared/keyDate.ts)
  const shown = keyDate(notice);
  const hasUpcomingDate = !!shown?.upcoming && daysUntil(shown.date) >= 0;
  // Dated sentences from the document, led by the one the notice's date comes from
  const facts = notice.keyPoints?.facts.map(f => f.text) || [];
  const quote = shown?.quote;
  const datedSentences = quote && !facts.includes(quote) ? [quote, ...facts] : facts;
  const dateLabel = shown?.label;
  // Phones show the first key point and the actions; the rest opens with "Show more"
  const [expanded, setExpanded] = React.useState(false);
  const more = expanded ? '' : 'max-md:hidden';
  const extraPoints = Math.max(0, (notice.keyPoints?.points.length ?? 0) - 1);

  // Score badge colours follow the notice's severity, as in the filters
  const getScoreBadge = (score: number) => {
    if (score >= CRITICAL_SCORE) {
      return {
        icon: 'shield',
        color: 'text-on-orange',
        border: 'border-orange-fill',
        bg: 'bg-orange-fill'
      };
    }
    if (score >= HIGH_SCORE) {
      return {
        icon: 'insights',
        color: 'text-cream',
        border: 'border-cream-line',
        bg: 'bg-cream-tint'
      };
    }
    return {
      icon: 'query_stats',
      color: 'text-ink-soft',
      border: 'border-line',
      bg: 'bg-panel-raised'
    };
  };

  const scoreMeta = getScoreBadge(notice.impactScore);

  return (
    <article className="bg-panel border border-line rounded-lg p-3.5 md:p-4 shadow-xs hover:bg-panel-raised transition-colors relative group">
      {/* Top Badge Cluster & Impact Score */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {isNew && <NewBadge />}
          <span className="px-2 py-0.5 rounded bg-wash border border-line text-accent font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider">
            {notice.regulator}<span className="max-md:hidden"> • {notice.jurisdiction}</span>
          </span>

          <span
            className={`px-2 py-0.5 rounded border font-['JetBrains_Mono'] text-[10px] font-bold tracking-wider ${FORMAT_BADGE[notice.format] ?? DEFAULT_BADGE}`}
          >
            {notice.type}
          </span>

          <span className={`font-['JetBrains_Mono'] text-[11px] text-muted break-all ${more}`}>
            {notice.ref}
          </span>

          {(notice.savedCopy || notice.archived) && (
            <span
              className="px-1.5 py-0.5 rounded bg-wash text-ink-soft border border-line font-['JetBrains_Mono'] text-[9px] font-bold uppercase tracking-wider"
              title={notice.savedCopy ? 'Copy saved on this device; open the source to check for updates' : "Stored when RegSonar read this source earlier; no longer among the source's latest items"}
            >
              {notice.savedCopy ? 'Saved copy' : 'From history'}
            </span>
          )}

          {notice.isLiveFeed && !notice.savedCopy && (
            <span className="max-md:hidden px-1.5 py-0.5 rounded bg-green-tint text-green border border-green-line font-['JetBrains_Mono'] text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-green-dot animate-pulse"></span>
              Live Feed
            </span>
          )}
        </div>

        {/* Impact Score */}
        <div
          className={`flex items-center gap-1.5 shrink-0 ${scoreMeta.bg} border ${scoreMeta.border} px-2 py-1 rounded`}
          title={`Impact score ${notice.impactScore.toFixed(1)} out of 10`}
        >
          <span className={`material-symbols-outlined text-sm ${scoreMeta.color}`} aria-hidden="true">
            {scoreMeta.icon}
          </span>
          <span className={`font-['JetBrains_Mono'] text-[11px] font-bold ${scoreMeta.color}`}>
            {notice.impactScore.toFixed(1)}/10
          </span>
          <span className="max-md:hidden font-['JetBrains_Mono'] text-[10px] font-semibold text-muted uppercase">
            Impact
          </span>
        </div>
      </div>

      {/* Main Title */}
      <h3 className="font-['Hanken_Grotesk'] text-[17px] md:text-[18px] text-ink font-bold mb-1 leading-snug">
        <button onClick={() => onOpenPdfDossier(notice)} className="text-left hover:text-accent transition-colors cursor-pointer">
          <span lang={notice.language}><Highlight text={notice.title} terms={highlight} /></span>
        </button>
      </h3>

      {/* Meta Timestamps & Statutory Deadlines */}
      <div className="flex flex-wrap items-center gap-3 text-muted font-['JetBrains_Mono'] text-[11px] mb-3 font-medium">
        <span className="flex items-center gap-1 text-ink-soft">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">schedule</span>
          Issued {notice.issuedTimeAgo}
        </span>

        {shown && <span>•</span>}

        {shown && (
          <span
            title={quote ? `From the document: “${quote}”` : undefined}
            className={`flex items-center gap-1 font-semibold ${
              shown.badge === 'deadline' ? 'text-accent' : shown.badge === 'action' ? 'text-orange' : 'text-ink-soft'
            }`}
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              {shown.badge === 'action' ? 'gavel' : 'event_upcoming'}
            </span>
            {shown.text}
          </span>
        )}
      </div>

      {/* Key points quoted from the source, or the source's own summary */}
      {notice.keyPoints && notice.keyPoints.points.length > 0 ? (
        <div className="p-3 md:p-3.5 bg-page border border-wash-strong rounded-lg mb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-accent font-['Inter'] text-[12px] font-bold">
              <span className="material-symbols-outlined text-base text-accent" aria-hidden="true">format_quote</span>
              <span className="md:hidden">Quoted from source</span>
              <span className="max-md:hidden">Key points, quoted from source</span>
              {notice.keyPoints.ocr && (
                <span
                  className="px-1.5 py-0.5 rounded bg-cream-tint border border-cream-line text-cream font-['JetBrains_Mono'] text-[9px] font-bold"
                  title="This document is a scanned PDF. Its text was read by OCR, so quotes may contain recognition errors."
                >
                  OCR · check wording
                </span>
              )}
            </div>
            {notice.keyPoints.sourceUrl && (
              <a
                href={notice.keyPoints.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-['JetBrains_Mono'] text-[10px] text-muted hover:text-accent hover:underline shrink-0"
              >
                Verify in document ↗
              </a>
            )}
          </div>
          <ul lang={notice.language} className="space-y-1.5 font-['Inter'] text-[12px] text-ink">
            {notice.keyPoints.points.map((point, idx) => (
              <li key={idx} className={`flex items-start gap-2 ${idx > 0 ? more : ''}`}>
                <span className="text-accent mt-0.5 text-xs font-bold shrink-0">“</span>
                <span className={`leading-relaxed ${expanded ? '' : 'max-md:line-clamp-3'}`}><Highlight text={point} terms={highlight} /></span>
              </li>
            ))}
          </ul>
          {datedSentences.length > 0 && (
            <div className={`mt-2.5 pt-2 border-t border-wash-strong space-y-1 ${more}`}>
              {datedSentences.map((text, idx) => (
                <div key={idx} className="flex items-start gap-2 font-['Inter'] text-[12px] text-ink-soft">
                  <span className="material-symbols-outlined text-sm text-cream shrink-0" aria-hidden="true">event</span>
                  <span className="leading-relaxed">
                    {text === quote && dateLabel && (
                      <span className="font-['JetBrains_Mono'] text-[11px] font-semibold text-accent mr-1.5">{dateLabel}:</span>
                    )}
                    {text}
                  </span>
                </div>
              ))}
            </div>
          )}
          {notice.keyPoints.refs.length > 0 && (
            <div className={`mt-2 flex flex-wrap items-center gap-1.5 ${more}`}>
              <span className="font-['JetBrains_Mono'] text-[10px] text-muted">Referenced:</span>
              {notice.keyPoints.refs.map((ref) => (
                <span key={ref} className="font-['JetBrains_Mono'] text-[10px] text-ink-soft bg-panel border border-line px-1.5 py-0.5 rounded">
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : notice.summary ? (
        <p className={`font-['Inter'] text-[13px] text-ink-soft mb-3 leading-relaxed ${expanded ? '' : 'max-md:line-clamp-4'}`}>
          <Highlight text={notice.summary} terms={highlight} />
        </p>
      ) : notice.dossierUrl ? (
        <p className="font-['Inter'] text-[12px] text-muted mb-3 italic">
          No text could be extracted for key points. Open the source document to read it.
        </p>
      ) : null}

      {/* Phones: the rest of the notice opens here */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="md:hidden -mt-1 mb-2 min-h-10 flex items-center gap-1 font-['Inter'] text-[12px] font-semibold text-accent"
      >
        <span className="material-symbols-outlined text-lg" aria-hidden="true">{expanded ? 'expand_less' : 'expand_more'}</span>
        {expanded ? 'Show less' : extraPoints > 0 ? `Show more: ${extraPoints} more key point${extraPoints === 1 ? '' : 's'}, tags, score` : 'Show more: tags, score'}
      </button>

      {/* Consultation and conclusions, matched by title */}
      {notice.related && notice.related.length > 0 && (
        <div className={`mb-3 space-y-1 ${more}`}>
          {notice.related.map(link => (
            <div key={link.id} className="flex items-start gap-1.5 font-['Inter'] text-[12px] text-ink-soft">
              <span className="material-symbols-outlined text-sm text-accent shrink-0" aria-hidden="true">
                {link.relation === 'consultation' ? 'undo' : 'redo'}
              </span>
              <span>
                {link.relation === 'consultation' ? 'Follows the consultation: ' : 'Conclusions published: '}
                <button
                  onClick={() => onOpenRelated?.(link.id, link.dossierUrl)}
                  className="text-left font-semibold text-accent hover:underline"
                >
                  {link.title}
                </button>
                {publishedDay(link.publishedAt, notice.jurisdictionCode) && <span className="text-muted"> ({formatDate(publishedDay(link.publishedAt, notice.jurisdictionCode)!)})</span>}
                <span className="text-muted" title="Regulators don't publish this link; it is matched by regulator and title words"> · matched by title</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Footer Row: Impacted Units / Tags & Dynamic Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Left: Tags or Units */}
        <div className={`flex flex-wrap items-center gap-1.5 ${more}`}>
          {notice.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded bg-wash border border-line text-ink-soft font-['JetBrains_Mono'] text-[11px] font-medium"
            >
              {tag}
            </span>
          ))}
          {notice.tagging && (
            <details className="w-full font-['Inter'] text-[11px] text-muted">
              <summary className="cursor-pointer hover:text-ink w-fit">Why these tags and score?</summary>
              <ul className="mt-1 space-y-0.5 pl-1">
                {(notice.sectors ?? [notice.sector]).map(sector => (
                  <li key={sector}>
                    <span className="text-ink-soft font-medium">{sector}</span>
                    {notice.tagging!.sectors[sector]?.length
                      ? <>: matched {notice.tagging!.sectors[sector]!.map(w => `“${w}”`).join(', ')}</>
                      : notice.tagging!.sectorFallback ? <>: {notice.tagging!.sectorFallback}</> : null}
                  </li>
                ))}
                <li>
                  <span className="text-ink-soft font-medium">{notice.format}</span>: {notice.tagging.format}
                </li>
                {notice.tagging.impact && (
                  <li>
                    <span className="text-ink-soft font-medium">Impact {notice.impactScore.toFixed(1)}</span>: {notice.tagging.impact.join('; ')}
                  </li>
                )}
                <li>Keyword rules, title words first, and the dates the source states; not an assessment of the document.</li>
              </ul>
            </details>
          )}
        </div>

        {/* Right: Actions; on phones one row of icons, with Source on the right */}
        <div className="max-md:w-full flex flex-wrap items-center gap-0.5 md:gap-1.5">
          {onCopyLink && (
            <button
              onClick={() => onCopyLink(notice)}
              className="w-10 h-10 md:w-auto md:h-auto md:p-1.5 flex items-center justify-center rounded text-muted hover:text-ink hover:bg-wash transition-colors"
              title="Copy a link to this notice"
              aria-label="Copy a link to this notice"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">link</span>
            </button>
          )}

          {onAddToCalendar && hasUpcomingDate && (
            <button
              onClick={() => onAddToCalendar(notice)}
              className="w-10 h-10 md:w-auto md:h-auto md:p-1.5 flex items-center justify-center rounded text-muted hover:text-ink hover:bg-wash transition-colors"
              title={`Add ${shown?.date} to your calendar (.ics)`}
              aria-label="Add this date to your calendar"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">calendar_add_on</span>
            </button>
          )}

          {/* Bookmark Button */}
          <button
            onClick={() => onToggleBookmark(notice.id)}
            aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
            className={`w-10 h-10 md:w-auto md:h-auto md:p-1.5 flex items-center justify-center rounded transition-colors ${
              isBookmarked
                ? 'text-accent bg-accent-tint'
                : 'text-muted hover:text-ink hover:bg-panel-raised'
            }`}
            title={isBookmarked ? 'Bookmarked' : 'Bookmark Alert'}
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              {isBookmarked ? 'bookmark_added' : 'bookmark'}
            </span>
          </button>

          <button
            onClick={() => onOpenGapAnalysis(notice)}
            title="Gap Checklist"
            className="max-md:w-10 h-10 md:h-auto md:px-2.5 md:py-1.5 bg-panel hover:bg-panel-raised border border-line text-ink max-md:border-transparent max-md:bg-transparent max-md:shadow-none max-md:text-muted font-['Inter'] text-[11px] font-semibold rounded flex items-center justify-center gap-1 transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-lg md:text-sm" aria-hidden="true">assignment</span>
            <span className="max-md:sr-only">Gap Checklist</span>
          </button>
          <button
            onClick={() => onOpenPdfDossier(notice)}
            title="Dossier"
            className="max-md:w-10 h-10 md:h-auto md:px-2.5 md:py-1.5 bg-panel hover:bg-panel-raised border border-line text-ink max-md:border-transparent max-md:bg-transparent max-md:shadow-none max-md:text-muted font-['Inter'] text-[11px] font-semibold rounded flex items-center justify-center gap-1 transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-lg md:text-sm" aria-hidden="true">description</span>
            <span className="max-md:sr-only">Dossier</span>
          </button>
          {notice.dossierUrl && (
            <a
              href={notice.dossierUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="max-md:ml-auto px-2.5 h-10 md:h-auto md:py-1.5 bg-accent hover:bg-accent-deep text-on-accent font-['Inter'] text-[12px] md:text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">open_in_new</span>
              Source
            </a>
          )}
        </div>
      </div>
    </article>
  );
};

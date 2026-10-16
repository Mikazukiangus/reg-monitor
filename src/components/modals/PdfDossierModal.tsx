import React, { useEffect, useRef } from 'react';
import { useDialog } from '../useDialog';
import { RegulatoryNotice } from '../../types/regulatory';
import { daysUntil, formatDate, publishedDay } from '../../lib/derived';
import { noticeTimeline } from '../../lib/timeline';

interface PdfDossierModalProps {
  notice: RegulatoryNotice | null;
  onClose: () => void;
  // Its place in the feed as filtered, to step through without closing
  position?: { index: number; total: number };
  onStep?: (delta: -1 | 1) => void;
  isBookmarked?: boolean;
  onToggleBookmark?: (id: string) => void;
  onOpenGapAnalysis?: (notice: RegulatoryNotice) => void;
  onCopyLink?: (notice: RegulatoryNotice) => void;
  onOpenRelated?: (id: string, url?: string) => void;
}

const relativeDays = (days: number) =>
  days === 0 ? 'Today' : days > 0 ? `in ${days} day${days === 1 ? '' : 's'}` : `${-days} day${days === -1 ? '' : 's'} ago`;

// Everything in the dossier comes from the source: metadata from the feed,
// key points and dated sentences quoted from the document.
export const PdfDossierModal: React.FC<PdfDossierModalProps> = ({
  notice, onClose, position, onStep, isBookmarked = false, onToggleBookmark, onOpenGapAnalysis, onCopyLink, onOpenRelated
}) => {
  const dialogRef = useDialog<HTMLDivElement>(!!notice, onClose);
  const bodyRef = useRef<HTMLDivElement>(null);
  // Each notice starts at its top
  useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }); }, [notice?.id]);
  if (!notice) return null;

  const canStep = !!onStep && !!position && position.total > 1;
  const hasPrev = canStep && position!.index > 0;
  const hasNext = canStep && position!.index < position!.total - 1;
  // j / k and the arrow keys step through the feed, as in mail and feed readers
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!canStep || e.altKey || e.ctrlKey || e.metaKey || (e.target as HTMLElement).closest('input, select, textarea')) return;
    if ((e.key === 'ArrowRight' || e.key === 'j') && hasNext) { e.preventDefault(); onStep!(1); }
    if ((e.key === 'ArrowLeft' || e.key === 'k') && hasPrev) { e.preventDefault(); onStep!(-1); }
  };
  const timeline = noticeTimeline(notice);
  const firstUpcoming = timeline.findIndex(step => daysUntil(step.date) > 0);
  const showToday = firstUpcoming > 0 && !timeline.some(step => daysUntil(step.date) === 0);

  const day = publishedDay(notice.publishedAt, notice.jurisdictionCode);
  const published = day ? formatDate(day) : 'Unknown';
  const keyPoints = notice.keyPoints;

  const handleDownload = () => {
    const lines = [
      `REGSONAR NOTICE DOSSIER`,
      ``,
      `Title: ${notice.title}`,
      `Regulator: ${notice.regulator} (${notice.jurisdiction})`,
      `Reference: ${notice.ref}`,
      `Type: ${notice.type}`,
      `Published: ${published}`,
      `Key date: ${notice.statutoryDeadline || 'None found'}${notice.deadlineQuote ? ` (from: "${notice.deadlineQuote}")` : ''}`,
      `Impact score (rubric by document kind and dates): ${notice.impactScore.toFixed(1)}/10${notice.tagging?.impact ? ` (${notice.tagging.impact.join('; ')})` : ''}`,
      `Source: ${notice.dossierUrl || 'n/a'}`,
      ``,
      ...(notice.summary ? [`SOURCE SUMMARY`, notice.summary, ``] : []),
      ...(keyPoints?.ocr ? [`NOTE: the source is a scanned PDF read by OCR; quotes may contain recognition errors.`, ``] : []),
      ...(keyPoints?.points.length ? [`KEY POINTS (quoted verbatim from the source document)`, ...keyPoints.points.map(p => `- "${p}"`), ``] : []),
      ...(keyPoints?.facts.length ? [`DATED STATEMENTS (quoted)`, ...keyPoints.facts.map(f => `- "${f.text}"`), ``] : []),
      ...(keyPoints?.refs.length ? [`REFERENCES MENTIONED`, keyPoints.refs.join(', '), ``] : []),
      `Generated ${new Date().toISOString()} by RegSonar from public regulator publications.`
    ];

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RegSonar_Dossier_${notice.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const meta: [string, string][] = [
    ['Reference', notice.ref],
    ['Type', notice.type],
    ['Published', published],
    ['Key Date', notice.statutoryDeadline || 'None found']
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center lg:justify-end bg-black/50 lg:bg-black/30 backdrop-blur-xs lg:backdrop-blur-none p-4 lg:p-0 overflow-y-auto">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dossier-title" tabIndex={-1} onKeyDown={handleKeyDown} className="focus:outline-none bg-panel border border-line-strong rounded-xl lg:rounded-none lg:border-y-0 lg:border-r-0 w-full max-w-3xl lg:max-w-[min(720px,56vw)] shadow-2xl overflow-hidden flex flex-col max-h-[92vh] lg:h-full lg:max-h-none">
        {/* Header */}
        <div className="p-4 bg-wash border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-accent text-2xl" aria-hidden="true">description</span>
            <div>
              <h2 id="dossier-title" className="font-['Hanken_Grotesk'] text-[17px] text-ink font-bold">
                Notice Dossier
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-muted line-clamp-1 break-all">
                {notice.ref} • {notice.regulator}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleDownload}
              className="px-3 max-sm:px-2 py-1.5 bg-accent hover:bg-accent-deep text-on-accent text-[12px] font-semibold rounded flex items-center gap-1 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-sm" aria-hidden="true">download</span>
              <span className="max-sm:sr-only">Download .txt</span>
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1 max-sm:w-10 max-sm:h-10 max-sm:-mr-2 flex items-center justify-center rounded text-muted hover:text-ink hover:bg-wash-strong transition-colors"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">close</span>
            </button>
          </div>
        </div>

        <div ref={bodyRef} tabIndex={0} aria-label="Dossier contents" className="p-4 sm:p-6 overflow-y-auto flex-1 bg-page font-['Inter'] space-y-5">
          <div className="border-b-2 border-line pb-4 flex justify-between items-start gap-4">
            <div>
              <h1 lang={notice.language} className="font-['Hanken_Grotesk'] text-[20px] font-bold text-ink leading-snug">
                {notice.title}
              </h1>
              <p className="font-['JetBrains_Mono'] text-[12px] text-ink-soft mt-1">
                {notice.regulator} • {notice.jurisdiction}
              </p>
            </div>
            <div className="text-right shrink-0 bg-panel border border-line p-2.5 rounded shadow-2xs" title={notice.tagging?.impact ? `${notice.tagging.impact.join("; ")}. A rubric, not a legal assessment.` : "A rubric by document kind and dates, not a legal assessment"}>
              <span className="font-['JetBrains_Mono'] text-[10px] text-muted uppercase block">
                Impact (rubric)
              </span>
              <span className="font-['JetBrains_Mono'] text-[20px] font-bold text-accent">
                {notice.impactScore.toFixed(1)}/10
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-b border-line">
            {meta.map(([label, value]) => (
              <div key={label}>
                <span className="font-['JetBrains_Mono'] text-[10px] text-muted uppercase block">{label}</span>
                <span className="font-['JetBrains_Mono'] text-[12px] text-ink font-bold break-words">{value}</span>
              </div>
            ))}
          </div>

          {(onToggleBookmark || onOpenGapAnalysis || onCopyLink) && (
            <div className="flex flex-wrap gap-2">
              {onToggleBookmark && (
                <button
                  onClick={() => onToggleBookmark(notice.id)}
                  aria-pressed={isBookmarked}
                  className={`min-h-9 px-3 rounded border font-['Inter'] text-[12px] font-semibold flex items-center gap-1.5 transition-colors ${
                    isBookmarked ? 'bg-accent-tint border-accent-line text-accent' : 'bg-panel border-line text-ink hover:bg-wash'
                  }`}
                >
                  <span className="material-symbols-outlined text-base" aria-hidden="true">{isBookmarked ? 'bookmark_added' : 'bookmark'}</span>
                  {isBookmarked ? 'Saved' : 'Save'}
                </button>
              )}
              {onOpenGapAnalysis && (
                <button
                  onClick={() => onOpenGapAnalysis(notice)}
                  className="min-h-9 px-3 rounded border border-line bg-panel text-ink hover:bg-wash font-['Inter'] text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-base text-accent" aria-hidden="true">assignment</span>
                  Gap checklist
                </button>
              )}
              {onCopyLink && (
                <button
                  onClick={() => onCopyLink(notice)}
                  className="min-h-9 px-3 rounded border border-line bg-panel text-ink hover:bg-wash font-['Inter'] text-[12px] font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <span className="material-symbols-outlined text-base text-accent" aria-hidden="true">link</span>
                  Copy link
                </button>
              )}
            </div>
          )}

          {/* Dates in order, each from the feed or quoted from a document */}
          {timeline.length > 1 && (
            <section aria-labelledby="dossier-timeline">
              <h2 id="dossier-timeline" className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-3 text-accent">
                Timeline
              </h2>
              <ol className="ml-1.5 border-l-2 border-line space-y-3">
                {timeline.map((step, i) => {
                  const days = daysUntil(step.date);
                  const dot = days < 0 ? 'bg-line-strong border-line-strong' : days === 0 ? 'bg-orange border-orange' : 'bg-panel border-accent';
                  const tone = days < 0 ? 'text-muted' : days <= 14 ? 'text-orange' : days <= 60 ? 'text-cream' : 'text-accent';
                  return (
                    <React.Fragment key={`${step.label}-${step.date}`}>
                      {showToday && i === firstUpcoming && (
                        <li className="relative pl-4 font-['JetBrains_Mono'] text-[11px] font-bold text-orange">
                          <span className="absolute -left-[6px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-orange" aria-hidden="true" />
                          Today, {formatDate(new Date().toISOString().slice(0, 10))}
                        </li>
                      )}
                      <li className="relative pl-4">
                        <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full border-2 ${dot}`} aria-hidden="true" />
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-['Inter'] text-[13px] font-semibold text-ink">{step.label}</span>
                          <span className="font-['JetBrains_Mono'] text-[12px] text-ink-soft">{formatDate(step.date)}</span>
                          <span className={`font-['JetBrains_Mono'] text-[11px] font-bold ${tone}`}>{relativeDays(days)}</span>
                        </div>
                        {step.quote && (
                          <p className="mt-0.5 font-['Inter'] text-[12px] text-ink-soft italic line-clamp-3">“{step.quote}”</p>
                        )}
                        {step.relatedId && step.relatedTitle && (
                          <button
                            onClick={() => onOpenRelated?.(step.relatedId!, step.relatedUrl)}
                            disabled={!onOpenRelated}
                            className="mt-0.5 text-left font-['Inter'] text-[12px] text-accent hover:underline"
                          >
                            {step.relatedTitle}
                          </button>
                        )}
                      </li>
                    </React.Fragment>
                  );
                })}
              </ol>
              <p className="mt-2 font-['Inter'] text-[11px] text-muted">
                Only dates the feed or the documents state. A linked consultation or conclusion is matched by regulator and title words.
              </p>
            </section>
          )}

          <div className="space-y-4 text-[13px] text-ink-soft leading-relaxed">
            {notice.summary && (
              <section>
                <h2 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-accent">
                  Source Summary
                </h2>
                <p>{notice.summary}</p>
              </section>
            )}

            {keyPoints && keyPoints.points.length > 0 && (
              <section>
                <h2 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-accent">
                  Key Points, Quoted from Source
                </h2>
                {keyPoints.ocr && (
                  <p className="text-[12px] text-cream mb-2">
                    This document is a scanned PDF. Its text was read by OCR, so quotes may contain recognition errors; check them against the document.
                  </p>
                )}
                <ul className="space-y-2">
                  {keyPoints.points.map((pt, i) => (
                    <li key={i} className="border-l-2 border-accent-line pl-3 italic">{pt}</li>
                  ))}
                </ul>
                {canStep && (
                  <p className="mt-2 font-['JetBrains_Mono'] text-[10px] text-muted not-italic">Key points are extractive: sentences quoted from the document.</p>
                )}
              </section>
            )}

            {keyPoints && keyPoints.facts.length > 0 && (
              <section>
                <h2 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-accent">
                  Dated Statements
                </h2>
                <ul className="space-y-2">
                  {keyPoints.facts.map((f, i) => (
                    <li key={i} className="border-l-2 border-cream-line pl-3 italic">{f.text}</li>
                  ))}
                </ul>
              </section>
            )}

            {keyPoints && keyPoints.refs.length > 0 && (
              <section>
                <h2 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 text-accent">
                  References Mentioned
                </h2>
                <p className="font-['JetBrains_Mono'] text-[12px]">{keyPoints.refs.join(', ')}</p>
              </section>
            )}

            {!notice.summary && !keyPoints && (
              <p className="text-muted">No text could be extracted from the source for this notice. Open the source document for details.</p>
            )}
          </div>
        </div>

        <div className="px-3 py-2 bg-wash border-t border-line flex items-center justify-between gap-3 font-['JetBrains_Mono'] text-[11px] text-muted pb-[calc(8px+env(safe-area-inset-bottom))] lg:pb-2">
          {canStep ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => onStep!(-1)}
                disabled={!hasPrev}
                aria-label="Previous notice"
                title="Previous notice (k or ←)"
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded border border-line bg-panel text-ink hover:bg-wash disabled:opacity-40 disabled:hover:bg-panel"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">chevron_left</span>
              </button>
              <span className="px-1.5 tabular-nums" aria-live="polite">
                {position!.index + 1} of {position!.total}
                <span className="sr-only">: {notice.title}</span>
              </span>
              <button
                onClick={() => onStep!(1)}
                disabled={!hasNext}
                aria-label="Next notice"
                title="Next notice (j or →)"
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded border border-line bg-panel text-ink hover:bg-wash disabled:opacity-40 disabled:hover:bg-panel"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">chevron_right</span>
              </button>
              <span className="max-lg:hidden pl-2 text-[10px]">j / k to move</span>
            </div>
          ) : (
            <span className="text-[10px]">Key points are extractive: sentences quoted from the document{keyPoints?.ocr ? ', read by OCR' : ''}.</span>
          )}
          {notice.dossierUrl && (
            <a href={notice.dossierUrl} target="_blank" rel="noopener noreferrer" className="text-accent font-bold hover:underline shrink-0 min-h-10 sm:min-h-0 flex items-center">
              Open source ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

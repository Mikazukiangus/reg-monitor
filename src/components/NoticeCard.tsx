import React from 'react';
import { RegulatoryNotice } from '../types/regulatory';

interface NoticeCardProps {
  notice: RegulatoryNotice;
  onOpenGapAnalysis: (notice: RegulatoryNotice) => void;
  onOpenPdfDossier: (notice: RegulatoryNotice) => void;
  onToggleBookmark: (id: string) => void;
  isBookmarked: boolean;
  density?: 'comfortable' | 'compact';
}

export const NoticeCard: React.FC<NoticeCardProps> = ({
  notice,
  onOpenGapAnalysis,
  onOpenPdfDossier,
  onToggleBookmark,
  isBookmarked,
  density = 'comfortable'
}) => {
  // Score badge icon and color tailored for light theme
  const getScoreBadge = (score: number) => {
    if (score >= 9.0) {
      return {
        icon: 'shield',
        color: 'text-[#A8432F]',
        border: 'border-[#ECC6B9]',
        bg: 'bg-[#F8E8E2]'
      };
    }
    if (score >= 8.0) {
      return {
        icon: 'insights',
        color: 'text-[#1F4E79]',
        border: 'border-[#B3C8D9]',
        bg: 'bg-[#D9E5EE]'
      };
    }
    return {
      icon: 'query_stats',
      color: 'text-[#3C4852]',
      border: 'border-[#D3DDD7]',
      bg: 'bg-[#F4F7F4]'
    };
  };

  const scoreMeta = getScoreBadge(notice.impactScore);

  if (density === 'compact') {
    return (
      <article className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg p-3 hover:bg-[#F4F7F4] transition-colors flex items-center justify-between gap-3 shadow-xs">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 rounded bg-[#E3EBE6] border border-[#D3DDD7] text-[#1F4E79] font-['JetBrains_Mono'] text-[10px] font-bold">
              {notice.regulator}
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B]">
              {notice.ref}
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#3C4852]">
              • {notice.issuedTimeAgo}
            </span>
          </div>
          <h4
            onClick={() => onOpenPdfDossier(notice)}
            className="font-['Hanken_Grotesk'] text-[14px] text-[#1D2630] font-bold truncate hover:text-[#1F4E79] cursor-pointer"
          >
            {notice.title}
          </h4>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`font-['JetBrains_Mono'] text-[11px] font-bold ${scoreMeta.color}`}>
            {notice.impactScore}/10
          </span>
          <button
            onClick={() => onOpenGapAnalysis(notice)}
            className="px-2.5 py-1 bg-[#1F4E79] text-white text-[11px] font-semibold rounded hover:bg-[#163A5C] transition-colors shadow-2xs"
          >
            Action
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg p-4 shadow-xs hover:bg-[#F4F7F4] transition-colors relative group">
      {/* Top Badge Cluster & Impact Score */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-0.5 rounded bg-[#E3EBE6] border border-[#D3DDD7] text-[#1F4E79] font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider">
            {notice.regulator} • {notice.jurisdiction}
          </span>

          <span
            className={`px-2 py-0.5 rounded border font-['JetBrains_Mono'] text-[10px] font-bold tracking-wider ${notice.typeColorClass.bg} ${notice.typeColorClass.text}`}
          >
            {notice.type}
          </span>

          <span className="font-['JetBrains_Mono'] text-[11px] text-[#56636B]">
            {notice.ref}
          </span>

          {notice.isLiveFeed && (
            <span className="px-1.5 py-0.5 rounded bg-[#D7E9DD] text-[#2F6249] border border-[#ABCDB7] font-['JetBrains_Mono'] text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#2F6249] animate-pulse"></span>
              Live Feed
            </span>
          )}
        </div>

        {/* Impact Score */}
        <div
          className={`flex items-center gap-1.5 shrink-0 ${scoreMeta.bg} border ${scoreMeta.border} px-2 py-1 rounded`}
        >
          <span className={`material-symbols-outlined text-sm ${scoreMeta.color}`}>
            {scoreMeta.icon}
          </span>
          <span className={`font-['JetBrains_Mono'] text-[11px] font-bold ${scoreMeta.color}`}>
            {notice.impactScore.toFixed(1)}/10
          </span>
          <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-[#56636B] uppercase">
            Impact
          </span>
        </div>
      </div>

      {/* Main Title */}
      <h3
        onClick={() => onOpenPdfDossier(notice)}
        className="font-['Hanken_Grotesk'] text-[18px] text-[#1D2630] font-bold hover:text-[#1F4E79] transition-colors cursor-pointer mb-1 leading-snug"
      >
        {notice.title}
      </h3>

      {/* Meta Timestamps & Statutory Deadlines */}
      <div className="flex flex-wrap items-center gap-3 text-[#56636B] font-['JetBrains_Mono'] text-[11px] mb-3 font-medium">
        <span className="flex items-center gap-1 text-[#3C4852]">
          <span className="material-symbols-outlined text-sm">schedule</span>
          Issued {notice.issuedTimeAgo}
        </span>

        {notice.statutoryDeadline && <span>•</span>}

        {notice.statutoryDeadline && (
          <span
            className={`flex items-center gap-1 font-semibold ${
              notice.statusBadge?.type === 'deadline'
                ? 'text-[#1F4E79]'
                : notice.statusBadge?.type === 'immediate'
                ? 'text-[#2F6249]'
                : notice.statusBadge?.type === 'action'
                ? 'text-[#A8432F]'
                : 'text-[#3C4852]'
            }`}
          >
            <span className="material-symbols-outlined text-sm">
              {notice.statusBadge?.type === 'immediate'
                ? 'check_circle'
                : notice.statusBadge?.type === 'action'
                ? 'gavel'
                : 'event_upcoming'}
            </span>
            {notice.statutoryDeadline}
          </span>
        )}
      </div>

      {/* Key points quoted from the source, or the source's own summary */}
      {notice.keyPoints && notice.keyPoints.points.length > 0 ? (
        <div className="p-3.5 bg-[#EEF3EF] border border-[#DCE4DF] rounded-lg mb-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-[#1F4E79] font-['Inter'] text-[12px] font-bold">
              <span className="material-symbols-outlined text-base text-[#1F4E79]">format_quote</span>
              <span>Key points, quoted from source</span>
              {notice.keyPoints.ocr && (
                <span
                  className="px-1.5 py-0.5 rounded bg-[#F3E8C6] border border-[#DCC68A] text-[#6E5410] font-['JetBrains_Mono'] text-[9px] font-bold"
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
                className="font-['JetBrains_Mono'] text-[10px] text-[#56636B] hover:text-[#1F4E79] hover:underline shrink-0"
              >
                Verify in document ↗
              </a>
            )}
          </div>
          <ul className="space-y-1.5 font-['Inter'] text-[12px] text-[#1D2630]">
            {notice.keyPoints.points.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-[#1F4E79] mt-0.5 text-xs font-bold shrink-0">“</span>
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
          {notice.keyPoints.facts.length > 0 && (
            <div className="mt-2.5 pt-2 border-t border-[#DCE4DF] space-y-1">
              {notice.keyPoints.facts.map((fact, idx) => (
                <div key={idx} className="flex items-start gap-2 font-['Inter'] text-[12px] text-[#3C4852]">
                  <span className="material-symbols-outlined text-sm text-[#6E5410] shrink-0">event</span>
                  <span className="leading-relaxed">{fact.text}</span>
                </div>
              ))}
            </div>
          )}
          {notice.keyPoints.refs.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B]">Referenced:</span>
              {notice.keyPoints.refs.map((ref) => (
                <span key={ref} className="font-['JetBrains_Mono'] text-[10px] text-[#3C4852] bg-[#FBFCFA] border border-[#D3DDD7] px-1.5 py-0.5 rounded">
                  {ref}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : notice.summary ? (
        <p className="font-['Inter'] text-[13px] text-[#3C4852] mb-3 leading-relaxed">
          {notice.summary}
        </p>
      ) : notice.dossierUrl ? (
        <p className="font-['Inter'] text-[12px] text-[#56636B] mb-3 italic">
          No text could be extracted for key points. Open the source document to read it.
        </p>
      ) : null}

      {/* Footer Row: Impacted Units / Tags & Dynamic Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Left: Tags or Units */}
        <div className="flex flex-wrap items-center gap-1.5">
          {notice.tags.map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 rounded bg-[#E3EBE6] border border-[#D3DDD7] text-[#3C4852] font-['JetBrains_Mono'] text-[11px] font-medium"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {/* Bookmark Button */}
          <button
            onClick={() => onToggleBookmark(notice.id)}
            className={`p-1.5 rounded transition-colors ${
              isBookmarked
                ? 'text-[#1F4E79] bg-[#D9E5EE]'
                : 'text-[#56636B] hover:text-[#1D2630] hover:bg-[#F4F7F4]'
            }`}
            title={isBookmarked ? 'Bookmarked' : 'Bookmark Alert'}
          >
            <span className="material-symbols-outlined text-lg">
              {isBookmarked ? 'bookmark_added' : 'bookmark'}
            </span>
          </button>

          <button
            onClick={() => onOpenGapAnalysis(notice)}
            className="px-2.5 py-1.5 bg-[#FBFCFA] hover:bg-[#F4F7F4] border border-[#D3DDD7] text-[#1D2630] font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-sm">assignment</span>
            Gap Checklist
          </button>
          <button
            onClick={() => onOpenPdfDossier(notice)}
            className="px-2.5 py-1.5 bg-[#FBFCFA] hover:bg-[#F4F7F4] border border-[#D3DDD7] text-[#1D2630] font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-sm">description</span>
            Dossier
          </button>
          {notice.dossierUrl && (
            <a
              href={notice.dossierUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 bg-[#1F4E79] hover:bg-[#163A5C] text-white font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-sm">open_in_new</span>
              Source
            </a>
          )}
        </div>
      </div>
    </article>
  );
};

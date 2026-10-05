import React from 'react';
import { RegulatoryNotice } from '../types/regulatory';

interface NoticeCardProps {
  notice: RegulatoryNotice;
  onOpenGapAnalysis: (notice: RegulatoryNotice) => void;
  onOpenPdfDossier: (notice: RegulatoryNotice) => void;
  onOpenDiffRedline: (notice: RegulatoryNotice) => void;
  onOpenCaseBrief: (notice: RegulatoryNotice) => void;
  onOpenDraftResponse: (notice: RegulatoryNotice) => void;
  onToggleBookmark: (id: string) => void;
  isBookmarked: boolean;
  density?: 'comfortable' | 'compact';
}

export const NoticeCard: React.FC<NoticeCardProps> = ({
  notice,
  onOpenGapAnalysis,
  onOpenPdfDossier,
  onOpenDiffRedline,
  onOpenCaseBrief,
  onOpenDraftResponse,
  onToggleBookmark,
  isBookmarked,
  density = 'comfortable'
}) => {
  // Score badge icon and color tailored for light theme
  const getScoreBadge = (score: number) => {
    if (score >= 9.0) {
      return {
        icon: 'shield',
        color: 'text-[#DC2626]',
        border: 'border-[#FECACA]',
        bg: 'bg-[#FEF2F2]'
      };
    }
    if (score >= 8.0) {
      return {
        icon: 'insights',
        color: 'text-[#0D5C63]',
        border: 'border-[#B2DFDB]',
        bg: 'bg-[#E6F4F4]'
      };
    }
    return {
      icon: 'query_stats',
      color: 'text-[#57534E]',
      border: 'border-[#E5DFD5]',
      bg: 'bg-[#FAF8F5]'
    };
  };

  const scoreMeta = getScoreBadge(notice.impactScore);

  if (density === 'compact') {
    return (
      <article className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-3 hover:bg-[#FAF8F5] transition-colors flex items-center justify-between gap-3 shadow-xs">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-1.5 py-0.5 rounded bg-[#F5F1E8] border border-[#E5DFD5] text-[#0D5C63] font-['JetBrains_Mono'] text-[10px] font-bold">
              {notice.regulator}
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74]">
              {notice.ref}
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#57534E]">
              • {notice.issuedTimeAgo}
            </span>
          </div>
          <h4
            onClick={() => onOpenPdfDossier(notice)}
            className="font-['Hanken_Grotesk'] text-[14px] text-[#1E1B18] font-bold truncate hover:text-[#0D5C63] cursor-pointer"
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
            className="px-2.5 py-1 bg-[#0D5C63] text-white text-[11px] font-semibold rounded hover:bg-[#09454A] transition-colors shadow-2xs"
          >
            Action
          </button>
        </div>
      </article>
    );
  }

  return (
    <article className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-4 shadow-xs hover:bg-[#FAF8F5] transition-colors relative group">
      {/* Top Badge Cluster & Impact Score */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-2 py-0.5 rounded bg-[#F5F1E8] border border-[#E5DFD5] text-[#0D5C63] font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-wider">
            {notice.regulator} • {notice.jurisdiction}
          </span>

          <span
            className={`px-2 py-0.5 rounded border font-['JetBrains_Mono'] text-[10px] font-bold tracking-wider ${notice.typeColorClass.bg} ${notice.typeColorClass.text}`}
          >
            {notice.type}
          </span>

          <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
            {notice.ref}
          </span>
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
          <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-[#857F74] uppercase">
            Impact
          </span>
        </div>
      </div>

      {/* Main Title */}
      <h3
        onClick={() => onOpenPdfDossier(notice)}
        className="font-['Hanken_Grotesk'] text-[18px] text-[#1E1B18] font-bold hover:text-[#0D5C63] transition-colors cursor-pointer mb-1 leading-snug"
      >
        {notice.title}
      </h3>

      {/* Meta Timestamps & Statutory Deadlines */}
      <div className="flex flex-wrap items-center gap-3 text-[#857F74] font-['JetBrains_Mono'] text-[11px] mb-3 font-medium">
        <span className="flex items-center gap-1 text-[#57534E]">
          <span className="material-symbols-outlined text-sm">schedule</span>
          Issued {notice.issuedTimeAgo}
        </span>

        <span>•</span>

        {notice.statutoryDeadline && (
          <span
            className={`flex items-center gap-1 font-semibold ${
              notice.statusBadge?.type === 'deadline'
                ? 'text-[#0D5C63]'
                : notice.statusBadge?.type === 'immediate'
                ? 'text-[#15803D]'
                : notice.statusBadge?.type === 'action'
                ? 'text-[#DC2626]'
                : 'text-[#57534E]'
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

      {/* AI Synthesis Box or Standard Narrative */}
      {notice.aiSynthesis ? (
        <div className="p-3.5 bg-[#FAF7F2] border border-[#E8E2D5] rounded-lg mb-3">
          <div className="flex items-center gap-1.5 text-[#0D5C63] font-['Inter'] text-[12px] font-bold mb-2">
            <span className="material-symbols-outlined text-base text-[#0D5C63]">auto_awesome</span>
            <span>{notice.aiSynthesis.title}</span>
          </div>
          <ul className="space-y-1.5 font-['Inter'] text-[12px] text-[#1E1B18]">
            {notice.aiSynthesis.points.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-[#0D5C63] mt-0.5 text-xs font-bold shrink-0">•</span>
                <span className="leading-relaxed">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="font-['Inter'] text-[13px] text-[#44403C] mb-3 leading-relaxed">
          {notice.summary}
        </p>
      )}

      {/* Footer Row: Impacted Units / Tags & Dynamic Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {/* Left: Tags or Units */}
        <div className="flex flex-wrap items-center gap-1.5">
          {notice.impactedUnits && notice.impactedUnits.length > 0 ? (
            <>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] mr-1">
                Impacted Units:
              </span>
              {notice.impactedUnits.map((unit) => (
                <span
                  key={unit}
                  className="px-2 py-0.5 rounded bg-[#F5F1E8] border border-[#E5DFD5] text-[#57534E] font-['JetBrains_Mono'] text-[11px] font-medium"
                >
                  {unit}
                </span>
              ))}
            </>
          ) : (
            notice.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded bg-[#F5F1E8] border border-[#E5DFD5] text-[#57534E] font-['JetBrains_Mono'] text-[11px] font-medium"
              >
                {tag}
              </span>
            ))
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {/* Bookmark Button */}
          <button
            onClick={() => onToggleBookmark(notice.id)}
            className={`p-1.5 rounded transition-colors ${
              isBookmarked
                ? 'text-[#0D5C63] bg-[#E6F4F4]'
                : 'text-[#857F74] hover:text-[#1E1B18] hover:bg-[#FAF8F5]'
            }`}
            title={isBookmarked ? 'Bookmarked' : 'Bookmark Alert'}
          >
            <span className="material-symbols-outlined text-lg">
              {isBookmarked ? 'bookmark_added' : 'bookmark'}
            </span>
          </button>

          {/* Conditional Action Buttons based on item */}
          {notice.id === 'mas-dpt-2024' && (
            <>
              <button
                onClick={() => onOpenGapAnalysis(notice)}
                className="px-3 py-1.5 bg-[#0D5C63] hover:bg-[#09454A] text-white font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-xs"
              >
                <span className="material-symbols-outlined text-sm">assignment</span>
                Flag for Gap Analysis
              </button>
              <button
                onClick={() => onOpenPdfDossier(notice)}
                className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-2xs"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                PDF Dossier
              </button>
            </>
          )}

          {notice.id === 'hkma-sfc-tokenised-2024' && (
            <button
              onClick={() => onOpenDiffRedline(notice)}
              className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-2xs"
            >
              <span>View Diff &amp; Redline</span>
              <span className="material-symbols-outlined text-sm">compare_arrows</span>
            </button>
          )}

          {notice.id === 'asic-greenwashing-2024' && (
            <button
              onClick={() => onOpenCaseBrief(notice)}
              className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-sm">gavel</span>
              Precedent Case Brief
            </button>
          )}

          {notice.id === 'jfsa-hft-2024' && (
            <button
              onClick={() => onOpenDraftResponse(notice)}
              className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-sm">edit_note</span>
              Draft Response
            </button>
          )}

          {notice.id === 'uk-fca-emir-apac-2024' && (
            <button
              onClick={() => onOpenPdfDossier(notice)}
              className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-2xs"
            >
              <span className="material-symbols-outlined text-sm">visibility</span>
              Review Terms
            </button>
          )}

          {/* Fallback actions for other items */}
          {notice.id !== 'mas-dpt-2024' &&
            notice.id !== 'hkma-sfc-tokenised-2024' &&
            notice.id !== 'asic-greenwashing-2024' &&
            notice.id !== 'jfsa-hft-2024' &&
            notice.id !== 'uk-fca-emir-apac-2024' && (
              <>
                <button
                  onClick={() => onOpenGapAnalysis(notice)}
                  className="px-2.5 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-2xs"
                >
                  <span className="material-symbols-outlined text-sm">assignment</span>
                  Analyze
                </button>
                <button
                  onClick={() => onOpenPdfDossier(notice)}
                  className="px-2.5 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded flex items-center gap-1 transition-colors shadow-2xs"
                >
                  <span className="material-symbols-outlined text-sm">description</span>
                  Dossier
                </button>
              </>
            )}
        </div>
      </div>
    </article>
  );
};

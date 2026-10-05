import React from 'react';
import { RegulatoryNotice } from '../../types/regulatory';

interface PdfDossierModalProps {
  notice: RegulatoryNotice | null;
  onClose: () => void;
}

export const PdfDossierModal: React.FC<PdfDossierModalProps> = ({ notice, onClose }) => {
  if (!notice) return null;

  const handleDownload = () => {
    const textContent = `
================================================================================
REGSONAR STATUTORY DOSSIER & REGULATORY LEGAL BRIEF
CONFIDENTIAL & PRIVILEGED - FOR COMPLIANCE & LEGAL COUNSEL USE ONLY
================================================================================

TITLE: ${notice.title}
REGULATOR: ${notice.regulator} (${notice.jurisdiction})
REFERENCE: ${notice.ref}
INSTRUMENT TYPE: ${notice.type}
IMPACT SCORE: ${notice.impactScore} / 10.0 (High Urgency)
ISSUED: ${notice.issuedTimeAgo}
STATUTORY DEADLINE: ${notice.statutoryDeadline || 'Immediate'}

EXECUTIVE SUMMARY & OPERATIONAL IMPACT:
${notice.summary || (notice.aiSynthesis ? notice.aiSynthesis.points.join('\n- ') : 'N/A')}

IMPACTED BUSINESS UNITS:
${notice.impactedUnits ? notice.impactedUnits.join(', ') : notice.tags.join(', ')}

LEGAL CITATIONS & STATUTORY ENFORCEMENT PREMISES:
1. Primary Authority: Monetary Authority / Supervisory Authority Statutory Powers.
2. Compliance Standard: Continuous real-time auditability and executive accountability.
3. Penalty Matrix: Statutory civil penalties, administrative reprimands, and license suspension.

AUDIT IDENTIFIER: RS-APAC-SYNC-99201-LIVE
TIMESTAMP: ${new Date().toISOString()}
================================================================================
    `.trim();

    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `RegSonar_Dossier_${notice.id}_${notice.ref.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#D8D0C2] rounded-xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-[#F5F1E8] border-b border-[#E5DFD5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0D5C63] text-2xl">description</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-[17px] text-[#1E1B18] font-bold">
                Regulatory Legal Dossier
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
                {notice.ref} • {notice.regulator}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="px-3 py-1.5 bg-[#0D5C63] hover:bg-[#09454A] text-white text-[12px] font-semibold rounded flex items-center gap-1 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              <span>Download File</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-[#857F74] hover:text-[#1E1B18] hover:bg-[#EAE4D7] transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Paper-styled Dossier View */}
        <div className="p-6 overflow-y-auto flex-1 bg-[#FAF7F2] font-['Inter'] space-y-5">
          {/* Institutional Stamp Header */}
          <div className="border-b-2 border-[#E5DFD5] pb-4 flex justify-between items-start">
            <div>
              <span className="font-['JetBrains_Mono'] text-[10px] tracking-widest text-[#15803D] uppercase font-bold block mb-1">
                INSTITUTIONAL REGULATORY SENTINEL • REGSONAR
              </span>
              <h1 className="font-['Hanken_Grotesk'] text-[20px] font-bold text-[#1E1B18] leading-snug">
                {notice.title}
              </h1>
              <p className="font-['JetBrains_Mono'] text-[12px] text-[#57534E] mt-1">
                Supervisory Depository: {notice.regulator} • {notice.jurisdiction}
              </p>
            </div>
            <div className="text-right shrink-0 bg-[#FFFFFF] border border-[#E5DFD5] p-2.5 rounded shadow-2xs">
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block">
                Impact Score
              </span>
              <span className="font-['JetBrains_Mono'] text-[20px] font-bold text-[#DC2626]">
                {notice.impactScore}/10
              </span>
            </div>
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-b border-[#E5DFD5]">
            <div>
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block">
                Reference Code
              </span>
              <span className="font-['JetBrains_Mono'] text-[12px] text-[#1E1B18] font-bold">
                {notice.ref}
              </span>
            </div>
            <div>
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block">
                Instrument Class
              </span>
              <span className="font-['JetBrains_Mono'] text-[12px] text-[#1E1B18] font-bold">
                {notice.type}
              </span>
            </div>
            <div>
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block">
                Statutory Timeline
              </span>
              <span className="font-['JetBrains_Mono'] text-[12px] text-[#0D5C63] font-bold">
                {notice.statutoryDeadline || 'Immediate'}
              </span>
            </div>
            <div>
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block">
                Audit Verification
              </span>
              <span className="font-['JetBrains_Mono'] text-[12px] text-[#15803D] font-bold">
                RS-APAC-VERIFIED
              </span>
            </div>
          </div>

          {/* Legal Analysis Body */}
          <div className="space-y-4 text-[13px] text-[#44403C] leading-relaxed">
            <div>
              <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 text-[#0D5C63]">
                <span className="material-symbols-outlined text-base">balance</span>
                1. Statutory Context &amp; Legal Premise
              </h4>
              <p>
                The supervisory authority has established mandatory procedural guardrails for regulated licensees. Under the statutory provisions of the relevant Financial Services and Markets regulatory regime, failure to demonstrate operational compliance carries civil enforcement risk and administrative reprimands.
              </p>
            </div>

            {notice.aiSynthesis && (
              <div>
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 text-[#0D5C63]">
                  <span className="material-symbols-outlined text-base">auto_awesome</span>
                  2. Executive Synthesis &amp; Direct Mandates
                </h4>
                <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-3.5 space-y-2 shadow-2xs">
                  {notice.aiSynthesis.points.map((pt, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-[#0D5C63] font-bold">•</span>
                      <span className="text-[#1E1B18]">{pt}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {notice.summary && (
              <div>
                <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 text-[#0D5C63]">
                  <span className="material-symbols-outlined text-base">format_align_left</span>
                  2. Regulatory Memorandum Excerpt
                </h4>
                <p className="p-3 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg text-[#1E1B18] shadow-2xs">
                  {notice.summary}
                </p>
              </div>
            )}

            <div>
              <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5 text-[#0D5C63]">
                <span className="material-symbols-outlined text-base">domain</span>
                3. Affected Operational Business Units
              </h4>
              <div className="flex flex-wrap gap-2">
                {(notice.impactedUnits || notice.tags).map((tag) => (
                  <span
                    key={tag}
                    className="px-2.5 py-1 rounded bg-[#FFFFFF] border border-[#E5DFD5] text-[#1E1B18] font-['JetBrains_Mono'] text-[11px] font-medium shadow-2xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-[#F5F1E8] border-t border-[#E5DFD5] flex items-center justify-between text-[11px] font-['JetBrains_Mono'] text-[#857F74]">
          <span>Audit Log Ref: RS-APAC-SYNC-99201-LIVE</span>
          <span>Security Classification: Restricted</span>
        </div>
      </div>
    </div>
  );
};

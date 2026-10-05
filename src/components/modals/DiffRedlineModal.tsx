import React, { useState } from 'react';
import { RegulatoryNotice } from '../../types/regulatory';

interface DiffRedlineModalProps {
  notice: RegulatoryNotice | null;
  onClose: () => void;
}

export const DiffRedlineModal: React.FC<DiffRedlineModalProps> = ({ notice, onClose }) => {
  if (!notice) return null;
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#D8D0C2] rounded-xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-[#F5F1E8] border-b border-[#E5DFD5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#15803D] text-2xl">compare_arrows</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-[17px] text-[#1E1B18] font-bold">
                Statutory Redline &amp; Diff Comparison
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
                {notice.ref} • Comparing Q4 2023 Circular vs Current Amendment (Oct 2024)
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="bg-[#FAF8F5] border border-[#E5DFD5] rounded p-0.5 flex">
              <button
                onClick={() => setViewMode('split')}
                className={`px-2.5 py-1 rounded text-[11px] font-['JetBrains_Mono'] transition-colors ${
                  viewMode === 'split' ? 'bg-[#0D5C63] text-white font-bold shadow-2xs' : 'text-[#57534E]'
                }`}
              >
                Side-by-Side
              </button>
              <button
                onClick={() => setViewMode('unified')}
                className={`px-2.5 py-1 rounded text-[11px] font-['JetBrains_Mono'] transition-colors ${
                  viewMode === 'unified' ? 'bg-[#0D5C63] text-white font-bold shadow-2xs' : 'text-[#57534E]'
                }`}
              >
                Unified Redline
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded text-[#857F74] hover:text-[#1E1B18] hover:bg-[#EAE4D7] transition-colors"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        {/* Diff Content */}
        <div className="p-5 overflow-y-auto flex-1 font-['Inter'] space-y-4 bg-[#FAF7F2]">
          <div className="flex items-center justify-between px-3 py-2 bg-[#FFFFFF] border border-[#E5DFD5] rounded text-[12px] font-['JetBrains_Mono'] shadow-2xs">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-[#DC2626] font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#DC2626]"></span>
                -14 Clauses Removed (Restrictive PI regime)
              </span>
              <span className="flex items-center gap-1.5 text-[#15803D] font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#15803D]"></span>
                +28 Clauses Added (Retail verification &amp; smart contract audit)
              </span>
            </div>
            <span className="text-[#857F74]">Authority: SFC &amp; HKMA Joint Secretariat</span>
          </div>

          {viewMode === 'split' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Previous Version */}
              <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-4 shadow-2xs">
                <div className="pb-2 mb-3 border-b border-[#E5DFD5] flex items-center justify-between">
                  <span className="font-['JetBrains_Mono'] text-[11px] text-[#DC2626] font-bold">
                    PREVIOUS GUIDANCE (OCTOBER 2023)
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74]">Superseded</span>
                </div>

                <div className="space-y-3 text-[12px] text-[#57534E] leading-relaxed">
                  <p className="bg-[#FEF2F2] border-l-2 border-[#DC2626] p-2 text-[#B91C1C] line-through">
                    Paragraph 4.2: Distribution of tokenised debt and security tokens shall be strictly confined to Professional Investors (PIs) within the meaning of section 1 of Part 1 of Schedule 1 to the SFO. Retail participation in primary offering or secondary market trading is explicitly prohibited.
                  </p>
                  <p className="p-2">
                    Paragraph 4.3: Intermediaries must ensure that prospective clients have undergone rigorous portfolio asset verification confirming liquid investable assets exceeding HKD 8,000,000.
                  </p>
                  <p className="bg-[#FEF2F2] border-l-2 border-[#DC2626] p-2 text-[#B91C1C] line-through">
                    Paragraph 6.1: Underlying blockchain networks must be restricted permissioned enterprise ledgers; public permissionless chains may not be utilized for settlement.
                  </p>
                </div>
              </div>

              {/* New Version */}
              <div className="bg-[#FFFFFF] border border-[#BBF7D0] rounded-lg p-4 shadow-2xs">
                <div className="pb-2 mb-3 border-b border-[#E5DFD5] flex items-center justify-between">
                  <span className="font-['JetBrains_Mono'] text-[11px] text-[#15803D] font-bold">
                    NEW STATUTORY DIRECTIVE (OCTOBER 2024)
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[10px] text-[#15803D] font-bold bg-[#DCFCE7] px-1.5 py-0.5 rounded">In Force</span>
                </div>

                <div className="space-y-3 text-[12px] text-[#1E1B18] leading-relaxed">
                  <p className="bg-[#F0FDF4] border-l-2 border-[#15803D] p-2 text-[#166534]">
                    Paragraph 4.2 (Amended): Intermediaries may offer public tokenised debt securities to retail clients under the SFO prospectus regime, provided that distributors execute institutional due diligence, token-smart contract independent source code verification, and statutory client asset segregation in cold-storage vaults.
                  </p>
                  <p className="p-2">
                    Paragraph 4.3: Intermediaries must implement appropriate knowledge assessments and product-governance risk disclosures specific to tokenised financial instruments.
                  </p>
                  <p className="bg-[#F0FDF4] border-l-2 border-[#15803D] p-2 text-[#166534]">
                    Paragraph 6.1 (Amended): Public permissionless layer-1 blockchains (e.g. Ethereum) may be utilized for settlement subject to smart contract upgradeability controls, gas contingency buffers, and secondary ledger synchronization with HKMA CMU.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-4 space-y-3 text-[13px] leading-relaxed shadow-2xs">
              <p className="text-[#1E1B18]">
                Distribution of tokenised debt and security tokens{' '}
                <span className="bg-[#FEF2F2] text-[#DC2626] line-through px-1 font-medium">
                  shall be strictly confined to Professional Investors (PIs)
                </span>{' '}
                <span className="bg-[#F0FDF4] text-[#15803D] font-bold px-1">
                  may be distributed to retail investors under the SFO prospectus regime
                </span>
                , provided that distributors execute institutional due diligence, independent code audit, and cold storage custodial segregation.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#F5F1E8] border-t border-[#E5DFD5] flex items-center justify-between text-[11px] font-['JetBrains_Mono']">
          <span className="text-[#857F74]">Redline Generated from SFC / HKMA Statutory Feeds</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#E5DFD5] text-[#1E1B18] rounded transition-colors shadow-2xs font-semibold"
          >
            Close Diff
          </button>
        </div>
      </div>
    </div>
  );
};

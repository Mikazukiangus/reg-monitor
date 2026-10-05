import React from 'react';
import { TREND_BRIEFS } from '../../data/regulatoryData';

interface FullDigestModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FullDigestModal: React.FC<FullDigestModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#D8D0C2] rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-[#F5F1E8] border-b border-[#E5DFD5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0D5C63] text-2xl">psychology</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-[18px] text-[#1E1B18] font-bold">
                Daily AI Brief &amp; Macro Regulatory Synthesis
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
                Generated 08:00 SGT • Analyzed across 24 APAC Statutory Feeds &amp; RegSonar Wire
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#857F74] hover:text-[#1E1B18] hover:bg-[#EAE4D7] transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 font-['Inter'] space-y-5 bg-[#FAF7F2]">
          {/* Executive Overview */}
          <div className="p-4 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg shadow-2xs">
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#15803D] uppercase font-bold tracking-wider block mb-1">
              Sentinel Intelligence Summary • RegSonar
            </span>
            <p className="text-[13px] text-[#1E1B18] leading-relaxed">
              APAC supervisory authorities are aggressively transitioning from principles-based advisories to statutory enforcement with board-level executive liabilities. Singapore (MAS) and Hong Kong (HKMA) are converging on operational resilience benchmarks, while Australia (ASIC) has initiated federal litigation penalizing unverified Scope 3 carbon representations.
            </p>
          </div>

          {/* Detailed Trends */}
          <div className="space-y-4">
            {TREND_BRIEFS.map((trend) => (
              <div key={trend.id} className="p-4 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg shadow-2xs">
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-['JetBrains_Mono'] text-[12px] font-bold ${trend.severityColor}`}>
                    {trend.tag}
                  </span>
                  <div className="flex gap-1.5">
                    {trend.jurisdictions.map(j => (
                      <span key={j} className="px-2 py-0.5 bg-[#F5F1E8] text-[#57534E] border border-[#E5DFD5] font-['JetBrains_Mono'] text-[10px] rounded font-bold">
                        {j}
                      </span>
                    ))}
                  </div>
                </div>
                <h4 className="font-['Hanken_Grotesk'] text-[15px] font-bold text-[#1E1B18] mb-2">
                  {trend.title}
                </h4>
                <p className="text-[13px] text-[#57534E] leading-relaxed mb-3">
                  {trend.summary}
                </p>
                <div className="p-2.5 bg-[#FAF8F5] border border-[#E5DFD5] rounded text-[11px] font-['JetBrains_Mono'] text-[#57534E] flex items-center justify-between">
                  <span>Action: Flagged for Legal Counsel review across HK &amp; SG entities</span>
                  <span className="text-[#15803D] font-bold">Status: Monitored</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#F5F1E8] border-t border-[#E5DFD5] flex items-center justify-between">
          <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
            Distribution: Registered General Counsel &amp; Chief Risk Officers
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#0D5C63] text-white text-[12px] font-semibold rounded hover:bg-[#0A474D] transition-colors shadow-xs"
          >
            Close Digest
          </button>
        </div>
      </div>
    </div>
  );
};

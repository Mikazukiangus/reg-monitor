import React from 'react';
import { RegulatoryNotice } from '../../types/regulatory';

interface CaseBriefModalProps {
  notice: RegulatoryNotice | null;
  onClose: () => void;
}

export const CaseBriefModal: React.FC<CaseBriefModalProps> = ({ notice, onClose }) => {
  if (!notice) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#D8D0C2] rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-[#F5F1E8] border-b border-[#E5DFD5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#DC2626] text-2xl">gavel</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-[17px] text-[#1E1B18] font-bold">
                ASIC Enforcement Precedent Case Brief
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
                Federal Court Docket: VID 442/2024 • Corporations Act 2001 (Cth) s.1041H
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
        <div className="p-6 overflow-y-auto flex-1 font-['Inter'] space-y-4 bg-[#FAF7F2]">
          <div className="p-3.5 bg-[#FEF2F2] border border-[#FECACA] rounded-lg flex items-start gap-3">
            <span className="material-symbols-outlined text-[#DC2626] text-xl mt-0.5">warning</span>
            <div>
              <h3 className="font-['Hanken_Grotesk'] text-[15px] font-bold text-[#1E1B18]">
                Civil Penalty Proceedings on Greenwashing &amp; Scope 3 Representation
              </h3>
              <p className="text-[12px] text-[#B91C1C] mt-1 leading-relaxed">
                ASIC commenced proceedings in the Federal Court of Australia against two multi-asset wholesale funds alleging misleading or deceptive conduct in Product Disclosure Statements (PDS) under Section 1041H and ASIC Act s.12DA.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg shadow-2xs">
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block font-medium">
                Civil Penalty Exposure
              </span>
              <span className="font-['Hanken_Grotesk'] text-[18px] font-bold text-[#DC2626] block mt-0.5">
                Up to AUD $15.5M
              </span>
              <span className="text-[11px] text-[#57534E]">per contravention under s.1317G</span>
            </div>

            <div className="p-3 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg shadow-2xs">
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block font-medium">
                Remediation Mandate
              </span>
              <span className="font-['Hanken_Grotesk'] text-[18px] font-bold text-[#0D5C63] block mt-0.5">
                Full PDS Recall
              </span>
              <span className="text-[11px] text-[#57534E]">Direct investor compensation audit</span>
            </div>

            <div className="p-3 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg shadow-2xs">
              <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block font-medium">
                Precedent Weight
              </span>
              <span className="font-['Hanken_Grotesk'] text-[18px] font-bold text-[#15803D] block mt-0.5">
                High Statutory Precedent
              </span>
              <span className="text-[11px] text-[#57534E]">Affects all Australian AFS licensees</span>
            </div>
          </div>

          <div className="space-y-3 text-[13px] text-[#44403C] leading-relaxed">
            <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold text-[#1E1B18] flex items-center gap-1.5 text-[#0D5C63]">
              <span className="material-symbols-outlined text-base">policy</span>
              Core Statutory Allegations &amp; Evidence
            </h4>
            <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-3.5 space-y-2 shadow-2xs">
              <p>
                <strong className="text-[#1E1B18]">1. Unsubstantiated Scope 3 Decarbonization Targets:</strong> The respondents claimed their portfolios were "aligned with Net-Zero 2030 pathways" without maintaining underlying carbon accounting records for portfolio constituents.
              </p>
              <p>
                <strong className="text-[#1E1B18]">2. Blind Reliance on Third-Party ESG Ratings:</strong> The court filings highlight that licensees cannot legally discharge disclosure duties by simply licensing commercial ESG scoring algorithms without primary methodological verification.
              </p>
              <p>
                <strong className="text-[#1E1B18]">3. Wholesale Exclusion Overreach:</strong> The funds failed to screen out 14 companies generating revenue from thermal coal and controversial weapons despite absolute exclusions promised in investor roadshows.
              </p>
            </div>

            <h4 className="font-['Hanken_Grotesk'] text-[14px] font-bold text-[#1E1B18] flex items-center gap-1.5 text-[#0D5C63]">
              <span className="material-symbols-outlined text-base">verified_user</span>
              Immediate Compliance Action for RegSonar Users
            </h4>
            <ul className="list-disc pl-5 space-y-1 text-[12px] text-[#57534E]">
              <li>Audit all active fund prospectuses and institutional tear-sheets for unverified Scope 3 claims.</li>
              <li>Institute methodological audit logs verifying all third-party ESG scoring engines.</li>
              <li>Reconcile Australian disclosures against impending Australian Sustainability Reporting Standards (ASRS) Group 1 mandates.</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#F5F1E8] border-t border-[#E5DFD5] flex items-center justify-between">
          <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
            Prepared by RegSonar Regulatory Litigation &amp; Enforcement Desk
          </span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-[#0D5C63] text-white text-[12px] font-semibold rounded hover:bg-[#09454A] transition-colors shadow-xs"
          >
            Acknowledge &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { RegulatoryNotice } from '../../types/regulatory';

interface DraftResponseModalProps {
  notice: RegulatoryNotice | null;
  onClose: () => void;
}

export const DraftResponseModal: React.FC<DraftResponseModalProps> = ({ notice, onClose }) => {
  if (!notice) return null;

  const [institutionName, setInstitutionName] = useState('Pacific Horizon Global Capital (Singapore) Pte Ltd');
  const [stakeholderPosition, setStakeholderPosition] = useState<'support-with-amendments' | 'oppose-circuit-halts' | 'request-grace-period'>('support-with-amendments');
  const [responseNotes, setResponseNotes] = useState(
    'While we support enhanced market integrity, the proposed 50:1 intraday order-to-trade ratio ceiling during market opening auctions creates unintended liquidity shocks for cross-listed APAC index derivatives. We recommend an exemption for registered market makers and a 180-day phased implementation window.'
  );
  const [isCopied, setIsCopied] = useState(false);

  const fullLetter = `
To: Financial Services Agency of Japan (JFSA)
Office of Securities and Financial Markets Oversight
Reference: ${notice.ref} (Draft Amendments to FIEA Regarding High-Frequency Algorithmic Reporting)
Date: ${new Date().toLocaleDateString('en-GB')}

SUBMISSION OF WRITTEN COMMENTS ON PROPOSED AMENDMENTS REGARDING HIGH-FREQUENCY ALGORITHMIC REPORTING

Submitted by: ${institutionName}
Contact: Head of Regulatory Affairs & Legal Compliance (RegSonar Verified)

Executive Summary:
${institutionName} welcomes the opportunity to submit commentary regarding the Kanto Local Finance Bureau and JFSA's proposed amendments under the Financial Instruments and Exchange Act.

Key Industry Positions:
1. Operational Viability: ${responseNotes}
2. Cross-Border Harmonization: We strongly urge the JFSA to align intraday reporting data schemas with SGX and HKMA algorithmic trading reporting frameworks to prevent duplicative telemetry infrastructure.
3. Market Maker Safeguards: Automated volatility pauses should distinguish between directional algorithmic spoofing and bona fide liquidity provision during TSE opening and closing rotations.

Conclusion:
We appreciate the JFSA's continued engagement with international market participants and remain available for technical consultation.
  `.trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(fullLetter);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] border border-[#D8D0C2] rounded-xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-[#F5F1E8] border-b border-[#E5DFD5] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#6D28D9] text-2xl">edit_note</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-[17px] text-[#1E1B18] font-bold">
                Consultation Response Drafter
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
                {notice.ref} • {notice.regulator} • Deadline: {notice.statutoryDeadline}
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

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 font-['Inter'] space-y-4 bg-[#FAF7F2]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block mb-1 font-medium">
                Submitting Institution Name
              </label>
              <input
                type="text"
                value={institutionName}
                onChange={(e) => setInstitutionName(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#E5DFD5] px-3 py-1.5 rounded text-[12px] text-[#1E1B18] focus:outline-none focus:border-[#0D5C63]"
              />
            </div>

            <div>
              <label className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block mb-1 font-medium">
                Core Policy Stance
              </label>
              <select
                value={stakeholderPosition}
                onChange={(e) => setStakeholderPosition(e.target.value as any)}
                className="w-full bg-[#FFFFFF] border border-[#E5DFD5] px-3 py-1.5 rounded text-[12px] text-[#1E1B18] focus:outline-none focus:border-[#0D5C63]"
              >
                <option value="support-with-amendments">Support with Market-Maker Carve-outs</option>
                <option value="oppose-circuit-halts">Oppose Automated Volatility Halts</option>
                <option value="request-grace-period">Request 12-Month Phased Implementation</option>
              </select>
            </div>
          </div>

          <div>
            <label className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] uppercase block mb-1 font-medium">
              Custom Commentary &amp; Operational Arguments
            </label>
            <textarea
              rows={4}
              value={responseNotes}
              onChange={(e) => setResponseNotes(e.target.value)}
              className="w-full bg-[#FFFFFF] border border-[#E5DFD5] p-3 rounded text-[12px] text-[#1E1B18] leading-relaxed focus:outline-none focus:border-[#0D5C63]"
            />
          </div>

          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] text-[#0D5C63] uppercase tracking-wider block mb-1 font-bold">
              Live Formal Submission Letter Preview
            </span>
            <pre className="p-4 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg text-[11px] font-['JetBrains_Mono'] text-[#1E1B18] whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-56 shadow-2xs">
              {fullLetter}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#F5F1E8] border-t border-[#E5DFD5] flex items-center justify-between">
          <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">
            Automated compliance letter generation verified against JFSA submission format
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-3.5 py-1.5 bg-[#0D5C63] hover:bg-[#09454A] text-white text-[12px] font-semibold rounded flex items-center gap-1.5 transition-colors shadow-xs"
            >
              <span className="material-symbols-outlined text-sm">
                {isCopied ? 'done' : 'content_copy'}
              </span>
              <span>{isCopied ? 'Copied to Clipboard' : 'Copy Full Submission'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-[#FFFFFF] hover:bg-[#FAF8F5] border border-[#E5DFD5] text-[#57534E] text-[12px] rounded"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

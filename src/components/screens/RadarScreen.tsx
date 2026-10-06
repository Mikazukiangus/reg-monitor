import React from 'react';
import { JurisdictionCode, RegulatoryNotice, SectorDomain } from '../../types/regulatory';
import { sortNewestFirst } from '../../lib/derived';

const SECTORS: SectorDomain[] = [
  'FinTech & Digital Assets',
  'Banking & Capital Markets',
  'ESG & Sustainability',
  'AI Governance & Ethics',
  'AML/CFT & Sanctions'
];

const JURISDICTIONS: { code: JurisdictionCode; label: string }[] = [
  { code: 'SG', label: 'SINGAPORE (MAS)' },
  { code: 'HK', label: 'HONG KONG (HKMA)' },
  { code: 'US', label: 'UNITED STATES (SEC/CFTC)' },
  { code: 'UK_EU', label: 'UNITED KINGDOM (PRA)' },
  { code: 'GLOBAL', label: 'GLOBAL (BIS/BCBS)' }
];

interface RadarScreenProps {
  notices: RegulatoryNotice[];
  onSelectNotice: (id: string) => void;
}

// Where live publications are landing, by sector and jurisdiction. Sector is
// assigned by keyword rules, so treat the grid as an index, not an assessment.
export const RadarScreen: React.FC<RadarScreenProps> = ({ notices, onSelectNotice }) => {
  const sorted = sortNewestFirst(notices);

  return (
    <div className="w-full px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-[#0D5C63] text-2xl">radar</span>
          <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-[#1E1B18]">
            Regulatory Radar
          </h1>
        </div>
        <p className="font-['Inter'] text-[13px] text-[#57534E]">
          Live publications by jurisdiction and sector, newest first. Sectors are assigned by keyword rules. Australia and Japan have no live source yet.
        </p>
      </div>

      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px] font-['Inter'] border-collapse">
            <thead>
              <tr className="bg-[#F5F1E8] border-b border-[#E5DFD5] font-['JetBrains_Mono'] text-[11px] text-[#1E1B18]">
                <th className="p-3.5 pl-5 min-w-[180px] font-bold">SECTOR</th>
                {JURISDICTIONS.map(j => (
                  <th key={j.code} className="p-3.5 min-w-[200px] font-bold">{j.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD5]">
              {SECTORS.map(sector => (
                <tr key={sector} className="align-top">
                  <td className="p-3.5 pl-5 font-bold text-[#1E1B18]">{sector}</td>
                  {JURISDICTIONS.map(j => {
                    const cell = sorted.filter(n => n.sector === sector && n.jurisdictionCode === j.code);
                    return (
                      <td key={j.code} className="p-3.5">
                        {cell.length === 0 ? (
                          <span className="text-[#C4BBAD]">–</span>
                        ) : (
                          <div className="space-y-1.5">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border bg-[#E6F4F4] text-[#0D5C63] border-[#B2DFDB]">
                              {cell.length} {cell.length === 1 ? 'notice' : 'notices'}
                            </span>
                            {cell.slice(0, 2).map(n => (
                              <button
                                key={n.id}
                                onClick={() => onSelectNotice(n.id)}
                                className="block text-left text-[#57534E] hover:text-[#0D5C63] leading-snug line-clamp-2"
                              >
                                {n.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

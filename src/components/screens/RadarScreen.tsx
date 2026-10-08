import React from 'react';
import { JurisdictionCode, RegulatoryNotice } from '../../types/regulatory';
import { SECTORS } from '../../lib/tagging';
import { sortNewestFirst } from '../../lib/derived';


const JURISDICTIONS: { code: JurisdictionCode; label: string }[] = [
  { code: 'SG', label: 'SINGAPORE (MAS, SGX REGCO)' },
  { code: 'MY', label: 'MALAYSIA (BNM, SC)' },
  { code: 'HK', label: 'HONG KONG (HKMA, SFC, HKEX)' },
  { code: 'US', label: 'UNITED STATES (SEC/CFTC, FINRA; AI RULES)' },
  { code: 'UK_EU', label: 'UK & EU (PRA, FCA, ESMA; AI RULES)' },
  { code: 'AU', label: 'AUSTRALIA (ASIC, ASX)' },
  { code: 'JP', label: 'JAPAN (JFSA, JPX; AI STRATEGY)' },
  { code: 'KR', label: 'SOUTH KOREA (MSIT, AI RULES)' },
  { code: 'CN', label: 'CHINA (STATE COUNCIL POLICY LIBRARY, AI RULES)' },
  { code: 'GLOBAL', label: 'GLOBAL (BIS/BCBS, FSB)' }
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
      <div className="bg-panel border border-line rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-prussian text-2xl" aria-hidden="true">radar</span>
          <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-ink">
            Regulatory Radar
          </h1>
        </div>
        <p className="font-['Inter'] text-[13px] text-ink-soft">
          Live publications by jurisdiction and sector, newest first. Sectors are assigned by keyword rules, and a notice with more than one sector appears in each of its rows.
        </p>
      </div>

      <div className="bg-panel border border-line rounded-xl overflow-hidden shadow-xs">
        {/* Scrolls on its own, sized to the screen below the fixed header (and
            above the bottom bar on phones), so the header row stays at the top
            and the sector column at the left while the grid scrolls */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Notices by sector and jurisdiction"
          className="overflow-auto max-h-[calc(100dvh_-_88px_-_56px_-_env(safe-area-inset-bottom)_-_24px)] md:max-h-[calc(100dvh_-_128px_-_24px)] focus-visible:-outline-offset-2"
        >
          <table className="w-full text-left text-[12px] font-['Inter'] border-separate border-spacing-0">
            <thead>
              <tr className="font-['JetBrains_Mono'] text-[11px] text-ink">
                <th scope="col" className="sticky top-0 left-0 z-30 bg-wash border-b border-r border-line p-3 pl-3 sm:p-3.5 sm:pl-5 min-w-[112px] sm:min-w-[180px] font-bold">SECTOR</th>
                {JURISDICTIONS.map(j => (
                  <th key={j.code} scope="col" className="sticky top-0 z-20 bg-wash border-b border-line p-3.5 min-w-[200px] font-bold">{j.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>*]:border-b-0">
              {SECTORS.map(sector => (
                <tr key={sector} className="align-top">
                  <th scope="row" className="sticky left-0 z-10 bg-panel border-b border-r border-line p-3 pl-3 sm:p-3.5 sm:pl-5 font-bold text-ink">{sector}</th>
                  {JURISDICTIONS.map(j => {
                    const cell = sorted.filter(n => (n.sectors ?? [n.sector]).includes(sector) && n.jurisdictionCode === j.code);
                    return (
                      <td key={j.code} className="p-3.5 border-b border-line">
                        {cell.length === 0 ? (
                          <span className="text-line-dim">–</span>
                        ) : (
                          <div className="space-y-1.5">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border bg-prussian-tint text-prussian border-prussian-line">
                              {cell.length} {cell.length === 1 ? 'notice' : 'notices'}
                            </span>
                            {cell.slice(0, 2).map(n => (
                              <button
                                key={n.id}
                                onClick={() => onSelectNotice(n.id)}
                                className="block text-left text-ink-soft hover:text-prussian leading-snug line-clamp-2"
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

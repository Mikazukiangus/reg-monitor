import React, { useState } from 'react';
import { JurisdictionCode, SectorDomain, UrgencySeverity } from '../types/regulatory';

interface FilterSidebarProps {
  selectedSeverities: UrgencySeverity[];
  onToggleSeverity: (sev: UrgencySeverity) => void;
  selectedJurisdictions: Record<JurisdictionCode, boolean>;
  onToggleJurisdiction: (code: JurisdictionCode) => void;
  selectedSectors: Record<SectorDomain, boolean>;
  onToggleSector: (sec: SectorDomain) => void;
  selectedFormat: string | null;
  onSelectFormat: (format: string | null) => void;
  onResetFilters: () => void;
}

export const FilterSidebar: React.FC<FilterSidebarProps> = ({
  selectedSeverities,
  onToggleSeverity,
  selectedJurisdictions,
  onToggleJurisdiction,
  selectedSectors,
  onToggleSector,
  selectedFormat,
  onSelectFormat,
  onResetFilters
}) => {
  const [latencies, setLatencies] = useState([
    { name: 'MAS (Singapore)', ping: 12, status: 'Operational' },
    { name: 'HKMA/SFC (Hong Kong)', ping: 14, status: 'Operational' },
    { name: 'ASIC (Australia)', ping: 28, status: 'Operational' },
    { name: 'JFSA (Japan)', ping: 32, status: 'Operational' }
  ]);
  const [isPinging, setIsPinging] = useState(false);

  const handleTestPing = () => {
    setIsPinging(true);
    setTimeout(() => {
      setLatencies([
        { name: 'MAS (Singapore)', ping: Math.floor(10 + Math.random() * 5), status: 'Operational' },
        { name: 'HKMA/SFC (Hong Kong)', ping: Math.floor(12 + Math.random() * 6), status: 'Operational' },
        { name: 'ASIC (Australia)', ping: Math.floor(25 + Math.random() * 8), status: 'Operational' },
        { name: 'JFSA (Japan)', ping: Math.floor(29 + Math.random() * 7), status: 'Operational' }
      ]);
      setIsPinging(false);
    }, 600);
  };

  return (
    <aside className="lg:col-span-3 flex flex-col gap-3">
      {/* Filters & Facets Panel */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E5DFD5]">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#0D5C63] text-base">filter_alt</span>
            <span className="font-['Hanken_Grotesk'] text-[16px] text-[#1E1B18] font-bold">
              Filters &amp; Facets
            </span>
          </div>
          <button
            onClick={onResetFilters}
            className="font-['Inter'] text-[11px] font-semibold text-[#857F74] hover:text-[#1E1B18] transition-colors"
            id="reset-filters"
          >
            Reset
          </button>
        </div>

        <div className="space-y-4">
          {/* Urgency Severity */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-[#857F74] block mb-1.5">
              Urgency Severity
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => onToggleSeverity('critical')}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border font-['JetBrains_Mono'] text-[11px] font-semibold transition-all ${
                  selectedSeverities.includes('critical')
                    ? 'bg-[#FEE2E2] border-[#FCA5A5] text-[#DC2626] shadow-2xs'
                    : 'bg-[#FAF8F5] border-[#E5DFD5] hover:bg-[#F5F1E8] text-[#57534E]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]"></span>
                Critical (4)
              </button>

              <button
                type="button"
                onClick={() => onToggleSeverity('high')}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border font-['JetBrains_Mono'] text-[11px] font-semibold transition-all ${
                  selectedSeverities.includes('high')
                    ? 'bg-[#E6F4F4] border-[#B2DFDB] text-[#0D5C63] shadow-2xs'
                    : 'bg-[#FAF8F5] border-[#E5DFD5] hover:bg-[#F5F1E8] text-[#57534E]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#0D5C63]"></span>
                High (11)
              </button>

              <button
                type="button"
                onClick={() => onToggleSeverity('info')}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border font-['JetBrains_Mono'] text-[11px] font-semibold transition-all ${
                  selectedSeverities.includes('info')
                    ? 'bg-[#EAE4D7] border-[#D8D0C2] text-[#1E1B18] shadow-2xs'
                    : 'bg-[#FAF8F5] border-[#E5DFD5] hover:bg-[#F5F1E8] text-[#57534E]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#78716C]"></span>
                Info (23)
              </button>
            </div>
          </div>

          {/* Primary Jurisdiction */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-[#857F74] block mb-1.5">
              Primary Jurisdiction
            </span>
            <div className="space-y-1">
              <label className="flex items-center justify-between p-1.5 rounded hover:bg-[#FAF8F5] cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedJurisdictions.SG}
                    onChange={() => onToggleJurisdiction('SG')}
                    className="w-3.5 h-3.5 rounded bg-white border-[#D8D0C2] text-[#0D5C63] focus:ring-0 cursor-pointer accent-[#0D5C63]"
                  />
                  <span className={`font-['Inter'] text-[12px] ${selectedJurisdictions.SG ? 'text-[#1E1B18] font-medium' : 'text-[#57534E]'}`}>
                    Singapore (MAS)
                  </span>
                </div>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] bg-[#F5F1E8] px-1.5 py-0.5 rounded border border-[#E5DFD5]">
                  12
                </span>
              </label>

              <label className="flex items-center justify-between p-1.5 rounded hover:bg-[#FAF8F5] cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedJurisdictions.HK}
                    onChange={() => onToggleJurisdiction('HK')}
                    className="w-3.5 h-3.5 rounded bg-white border-[#D8D0C2] text-[#0D5C63] focus:ring-0 cursor-pointer accent-[#0D5C63]"
                  />
                  <span className={`font-['Inter'] text-[12px] ${selectedJurisdictions.HK ? 'text-[#1E1B18] font-medium' : 'text-[#57534E]'}`}>
                    Hong Kong (HKMA, SFC)
                  </span>
                </div>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] bg-[#F5F1E8] px-1.5 py-0.5 rounded border border-[#E5DFD5]">
                  8
                </span>
              </label>

              <label className="flex items-center justify-between p-1.5 rounded hover:bg-[#FAF8F5] cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedJurisdictions.AU}
                    onChange={() => onToggleJurisdiction('AU')}
                    className="w-3.5 h-3.5 rounded bg-white border-[#D8D0C2] text-[#0D5C63] focus:ring-0 cursor-pointer accent-[#0D5C63]"
                  />
                  <span className={`font-['Inter'] text-[12px] ${selectedJurisdictions.AU ? 'text-[#1E1B18] font-medium' : 'text-[#57534E]'}`}>
                    Australia (ASIC, APRA)
                  </span>
                </div>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] bg-[#F5F1E8] px-1.5 py-0.5 rounded border border-[#E5DFD5]">
                  7
                </span>
              </label>

              <label className="flex items-center justify-between p-1.5 rounded hover:bg-[#FAF8F5] cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedJurisdictions.JP}
                    onChange={() => onToggleJurisdiction('JP')}
                    className="w-3.5 h-3.5 rounded bg-white border-[#D8D0C2] text-[#0D5C63] focus:ring-0 cursor-pointer accent-[#0D5C63]"
                  />
                  <span className={`font-['Inter'] text-[12px] ${selectedJurisdictions.JP ? 'text-[#1E1B18] font-medium' : 'text-[#57534E]'}`}>
                    Japan (JFSA)
                  </span>
                </div>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] bg-[#F5F1E8] px-1.5 py-0.5 rounded border border-[#E5DFD5]">
                  5
                </span>
              </label>

              <label className="flex items-center justify-between p-1.5 rounded hover:bg-[#FAF8F5] cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedJurisdictions.UK_EU}
                    onChange={() => onToggleJurisdiction('UK_EU')}
                    className="w-3.5 h-3.5 rounded bg-white border-[#D8D0C2] text-[#0D5C63] focus:ring-0 cursor-pointer accent-[#0D5C63]"
                  />
                  <span className={`font-['Inter'] text-[12px] ${selectedJurisdictions.UK_EU ? 'text-[#1E1B18] font-medium' : 'text-[#57534E]'}`}>
                    UK &amp; EU (FCA, ESMA)
                  </span>
                </div>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] bg-[#F5F1E8] px-1.5 py-0.5 rounded border border-[#E5DFD5]">
                  4
                </span>
              </label>

              <label className="flex items-center justify-between p-1.5 rounded hover:bg-[#FAF8F5] cursor-pointer transition-colors">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedJurisdictions.US}
                    onChange={() => onToggleJurisdiction('US')}
                    className="w-3.5 h-3.5 rounded bg-white border-[#D8D0C2] text-[#0D5C63] focus:ring-0 cursor-pointer accent-[#0D5C63]"
                  />
                  <span className={`font-['Inter'] text-[12px] ${selectedJurisdictions.US ? 'text-[#1E1B18] font-medium' : 'text-[#57534E]'}`}>
                    United States (SEC, CFTC)
                  </span>
                </div>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] bg-[#F5F1E8] px-1.5 py-0.5 rounded border border-[#E5DFD5]">
                  2
                </span>
              </label>
            </div>
          </div>

          {/* Sector / Domain */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-[#857F74] block mb-1.5">
              Sector / Domain
            </span>
            <div className="space-y-1">
              {(
                [
                  'FinTech & Digital Assets',
                  'Banking & Capital Markets',
                  'ESG & Sustainability',
                  'AI Governance & Ethics',
                  'AML/CFT & Sanctions'
                ] as SectorDomain[]
              ).map((sector) => (
                <label
                  key={sector}
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-[#FAF8F5] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSectors[sector]}
                    onChange={() => onToggleSector(sector)}
                    className="w-3.5 h-3.5 rounded bg-white border-[#D8D0C2] text-[#0D5C63] focus:ring-0 cursor-pointer accent-[#0D5C63]"
                  />
                  <span
                    className={`font-['Inter'] text-[12px] ${
                      selectedSectors[sector] ? 'text-[#1E1B18] font-medium' : 'text-[#57534E]'
                    }`}
                  >
                    {sector}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Instrument Format */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-[#857F74] block mb-1.5">
              Instrument Format
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Circulars' ? null : 'Circulars')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Circulars'
                    ? 'bg-[#0D5C63] text-white border-[#0D5C63] shadow-2xs'
                    : 'bg-[#FAF8F5] border-[#E5DFD5] hover:bg-[#F5F1E8] text-[#1E1B18]'
                }`}
              >
                Circulars (14)
              </button>

              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Consultations' ? null : 'Consultations')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Consultations'
                    ? 'bg-[#0D5C63] text-white border-[#0D5C63] shadow-2xs'
                    : 'bg-[#FAF8F5] border-[#E5DFD5] hover:bg-[#F5F1E8] text-[#1E1B18]'
                }`}
              >
                Consultations (9)
              </button>

              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Enforcement' ? null : 'Enforcement')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Enforcement'
                    ? 'bg-[#DC2626] text-white border-[#DC2626] shadow-2xs'
                    : 'bg-[#FAF8F5] border-[#E5DFD5] hover:bg-[#F5F1E8] text-[#DC2626]'
                }`}
              >
                Enforcement (6)
              </button>

              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Guidelines' ? null : 'Guidelines')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Guidelines'
                    ? 'bg-[#0D5C63] text-white border-[#0D5C63] shadow-2xs'
                    : 'bg-[#FAF8F5] border-[#E5DFD5] hover:bg-[#F5F1E8] text-[#57534E]'
                }`}
              >
                Guidelines (9)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Jurisdiction Mesh Card */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="font-['Inter'] text-[13px] font-bold text-[#1E1B18]">
            Jurisdiction Mesh
          </span>
          <button
            onClick={handleTestPing}
            className="flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-[#15803D] hover:underline font-semibold"
            title="Click to ping gateways"
          >
            <span className={`w-1.5 h-1.5 rounded-full bg-[#15803D] ${isPinging ? 'animate-ping' : ''}`}></span>
            Real-time Ping
          </button>
        </div>
        <p className="font-['Inter'] text-[12px] text-[#857F74] mb-2.5">
          Latency to primary APAC regulatory statutory depositories.
        </p>

        <div className="space-y-2">
          {latencies.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-[12px]">
              <span className="text-[#57534E] font-['Inter']">{item.name}</span>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#15803D] font-semibold flex items-center gap-1">
                <span>{item.ping}ms</span>
                <span className="text-[#857F74]">•</span>
                <span>{item.status}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};

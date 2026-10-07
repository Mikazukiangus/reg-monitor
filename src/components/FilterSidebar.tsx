import React from 'react';
import { JurisdictionCode, SectorDomain, UrgencySeverity } from '../types/regulatory';
import { EndpointMetric, STATUS_STYLES } from './modals/LiveEndpointsModal';

// Labels name only the regulators RegSonar actually reads
const JURISDICTION_OPTIONS: { code: JurisdictionCode; label: string; note?: string }[] = [
  { code: 'SG', label: 'Singapore (MAS)' },
  { code: 'HK', label: 'Hong Kong (HKMA, SFC)' },
  { code: 'UK_EU', label: 'United Kingdom (PRA, FCA)' },
  { code: 'US', label: 'United States (SEC, CFTC)' },
  { code: 'GLOBAL', label: 'Global (BIS, Basel Committee)' },
  { code: 'AU', label: 'Australia (ASIC)' },
  { code: 'JP', label: 'Japan (JFSA)' }
];

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
  jurisdictionCounts: Record<JurisdictionCode, number>;
  severityCounts: Record<UrgencySeverity, number>;
  formatCounts: Record<string, number>;
  endpoints: EndpointMetric[];
  onPingEndpoints: () => void;
  isPinging: boolean;
  // 'rail' is the desktop left column; 'drawer' is the mobile filter sheet
  variant?: 'rail' | 'drawer';
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
  onResetFilters,
  jurisdictionCounts,
  severityCounts,
  formatCounts,
  endpoints,
  onPingEndpoints,
  isPinging,
  variant = 'rail'
}) => {
  return (
    <aside className={variant === 'rail' ? 'hidden lg:flex lg:col-span-3 flex-col gap-3' : 'flex flex-col gap-3'}>
      {/* Filters & Facets Panel */}
      <div className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#D3DDD7]">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#1F4E79] text-base">filter_alt</span>
            <span className="font-['Hanken_Grotesk'] text-[16px] text-[#1D2630] font-bold">
              Filters &amp; Facets
            </span>
          </div>
          <button
            onClick={onResetFilters}
            className="font-['Inter'] text-[11px] font-semibold text-[#56636B] hover:text-[#1D2630] transition-colors"
            id="reset-filters"
          >
            Reset
          </button>
        </div>

        <div className="space-y-4">
          {/* Urgency Severity */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-[#56636B] block mb-1.5">
              Urgency Severity
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => onToggleSeverity('critical')}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border font-['JetBrains_Mono'] text-[11px] font-semibold transition-all ${
                  selectedSeverities.includes('critical')
                    ? 'bg-[#F4DCD3] border-[#E2B5A6] text-[#A8432F] shadow-2xs'
                    : 'bg-[#F4F7F4] border-[#D3DDD7] hover:bg-[#E3EBE6] text-[#3C4852]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#A8432F]"></span>
                Critical ({severityCounts.critical})
              </button>

              <button
                type="button"
                onClick={() => onToggleSeverity('high')}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border font-['JetBrains_Mono'] text-[11px] font-semibold transition-all ${
                  selectedSeverities.includes('high')
                    ? 'bg-[#D9E5EE] border-[#B3C8D9] text-[#1F4E79] shadow-2xs'
                    : 'bg-[#F4F7F4] border-[#D3DDD7] hover:bg-[#E3EBE6] text-[#3C4852]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#1F4E79]"></span>
                High ({severityCounts.high})
              </button>

              <button
                type="button"
                onClick={() => onToggleSeverity('info')}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border font-['JetBrains_Mono'] text-[11px] font-semibold transition-all ${
                  selectedSeverities.includes('info')
                    ? 'bg-[#DCE4DF] border-[#C5D2CA] text-[#1D2630] shadow-2xs'
                    : 'bg-[#F4F7F4] border-[#D3DDD7] hover:bg-[#E3EBE6] text-[#3C4852]'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#56636B]"></span>
                Info ({severityCounts.info})
              </button>
            </div>
          </div>

          {/* Primary Jurisdiction */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-[#56636B] block mb-1.5">
              Primary Jurisdiction
            </span>
            <div className="space-y-1">
              {JURISDICTION_OPTIONS.map(({ code, label, note }) => (
                <label
                  key={code}
                  className="flex items-center justify-between gap-2 p-1.5 min-h-[40px] lg:min-h-0 rounded hover:bg-[#F4F7F4] cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedJurisdictions[code]}
                      onChange={() => onToggleJurisdiction(code)}
                      className="w-4 h-4 lg:w-3.5 lg:h-3.5 shrink-0 rounded bg-white border-[#C5D2CA] text-[#1F4E79] focus:ring-0 cursor-pointer accent-[#1F4E79]"
                    />
                    <span className="flex flex-col min-w-0">
                      <span className={`font-['Inter'] text-[12px] ${selectedJurisdictions[code] ? 'text-[#1D2630] font-medium' : 'text-[#3C4852]'}`}>
                        {label}
                      </span>
                      {note && <span className="font-['Inter'] text-[11px] text-[#56636B]">{note}</span>}
                    </span>
                  </div>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-[#56636B] bg-[#E3EBE6] px-1.5 py-0.5 rounded border border-[#D3DDD7] shrink-0">
                    {jurisdictionCounts[code]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Sector / Domain */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-[#56636B] block mb-1.5">
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
                  className="flex items-center gap-2 p-1.5 rounded hover:bg-[#F4F7F4] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selectedSectors[sector]}
                    onChange={() => onToggleSector(sector)}
                    className="w-3.5 h-3.5 rounded bg-white border-[#C5D2CA] text-[#1F4E79] focus:ring-0 cursor-pointer accent-[#1F4E79]"
                  />
                  <span
                    className={`font-['Inter'] text-[12px] ${
                      selectedSectors[sector] ? 'text-[#1D2630] font-medium' : 'text-[#3C4852]'
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
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-[#56636B] block mb-1.5">
              Instrument Format
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Circulars' ? null : 'Circulars')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Circulars'
                    ? 'bg-[#1F4E79] text-white border-[#1F4E79] shadow-2xs'
                    : 'bg-[#F4F7F4] border-[#D3DDD7] hover:bg-[#E3EBE6] text-[#1D2630]'
                }`}
              >
                Circulars ({formatCounts.Circulars || 0})
              </button>

              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Consultations' ? null : 'Consultations')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Consultations'
                    ? 'bg-[#1F4E79] text-white border-[#1F4E79] shadow-2xs'
                    : 'bg-[#F4F7F4] border-[#D3DDD7] hover:bg-[#E3EBE6] text-[#1D2630]'
                }`}
              >
                Consultations ({formatCounts.Consultations || 0})
              </button>

              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Enforcement' ? null : 'Enforcement')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Enforcement'
                    ? 'bg-[#A8432F] text-white border-[#A8432F] shadow-2xs'
                    : 'bg-[#F4F7F4] border-[#D3DDD7] hover:bg-[#E3EBE6] text-[#A8432F]'
                }`}
              >
                Enforcement ({formatCounts.Enforcement || 0})
              </button>

              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Guidelines' ? null : 'Guidelines')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Guidelines'
                    ? 'bg-[#1F4E79] text-white border-[#1F4E79] shadow-2xs'
                    : 'bg-[#F4F7F4] border-[#D3DDD7] hover:bg-[#E3EBE6] text-[#3C4852]'
                }`}
              >
                Guidelines ({formatCounts.Guidelines || 0})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Jurisdiction Mesh Card */}
      <div className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="font-['Inter'] text-[13px] font-bold text-[#1D2630]">
            Jurisdiction Mesh
          </span>
          <button
            onClick={onPingEndpoints}
            disabled={isPinging}
            className="flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-[#1F4E79] hover:underline font-semibold disabled:opacity-60"
            title="Re-check the monitored endpoints"
          >
            <span className={`w-1.5 h-1.5 rounded-full bg-[#1F4E79] ${isPinging ? 'animate-ping' : ''}`}></span>
            {isPinging ? 'Checking...' : 'Check Now'}
          </button>
        </div>
        <p className="font-['Inter'] text-[12px] text-[#56636B] mb-2.5">
          Response time from the RegSonar server to each monitored source.
        </p>

        <div className="space-y-2">
          {endpoints.map((ep) => (
            <div key={ep.id} className="flex items-center justify-between text-[12px]" title={ep.detail}>
              <span className="text-[#3C4852] font-['Inter']">{ep.agency}</span>
              <span className={`font-['JetBrains_Mono'] text-[11px] font-semibold flex items-center gap-1 ${STATUS_STYLES[ep.status].text}`}>
                {ep.pingMs !== null && (
                  <>
                    <span>{ep.pingMs}ms</span>
                    <span className="text-[#56636B]">•</span>
                  </>
                )}
                <span>{ep.status}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};

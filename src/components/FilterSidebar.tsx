import React from 'react';
import { JurisdictionCode, SectorDomain, UrgencySeverity } from '../types/regulatory';
import { SECTORS } from '../lib/tagging';
import { EndpointMetric, STATUS_STYLES } from './modals/LiveEndpointsModal';

// Labels name only the regulators RegSonar actually reads
const JURISDICTION_OPTIONS: { code: JurisdictionCode; label: string; note?: string }[] = [
  { code: 'SG', label: 'Singapore (MAS, SGX RegCo)' },
  { code: 'MY', label: 'Malaysia (BNM, SC)' },
  { code: 'HK', label: 'Hong Kong (HKMA, SFC, HKEX)' },
  { code: 'UK_EU', label: 'UK & EU (PRA, FCA, ESMA; AI: European Commission, DSIT)' },
  { code: 'US', label: 'United States (SEC, CFTC, FINRA; AI: federal agencies, FTC, California, Colorado)' },
  { code: 'GLOBAL', label: 'Global (BIS, Basel Committee, FSB)' },
  { code: 'AU', label: 'Australia (ASIC, ASX)' },
  { code: 'JP', label: 'Japan (JFSA, JPX; AI: Cabinet Office)' },
  { code: 'KR', label: 'South Korea (AI: MSIT)' },
  { code: 'CN', label: 'China (AI: State Council policy library)' }
];

interface FilterSidebarProps {
  selectedSeverities: UrgencySeverity[];
  onToggleSeverity: (sev: UrgencySeverity) => void;
  selectedJurisdictions: Record<JurisdictionCode, boolean>;
  onToggleJurisdiction: (code: JurisdictionCode) => void;
  selectedSectors: Record<SectorDomain, boolean>;
  sectorCounts: Record<SectorDomain, number>;
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
  sectorCounts,
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
    <aside aria-label="Filters" className={variant === 'rail' ? 'hidden lg:flex lg:col-span-3 flex-col gap-3' : 'flex flex-col gap-3'}>
      {/* Filters & Facets Panel */}
      <div className="bg-panel border border-line rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-3 pb-2 border-b border-line">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-accent text-base" aria-hidden="true">filter_alt</span>
            <span className="font-['Hanken_Grotesk'] text-[16px] text-ink font-bold">
              Filters &amp; Facets
            </span>
          </div>
          <button
            onClick={onResetFilters}
            className="font-['Inter'] text-[11px] font-semibold text-muted hover:text-ink transition-colors"
            id="reset-filters"
          >
            Reset
          </button>
        </div>

        <div className="space-y-4">
          {/* Urgency Severity */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-muted block mb-1.5">
              Urgency Severity
            </span>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => onToggleSeverity('critical')}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border font-['JetBrains_Mono'] text-[11px] font-semibold transition-all ${
                  selectedSeverities.includes('critical')
                    ? 'bg-orange-fill border-orange-fill text-on-orange shadow-2xs'
                    : 'bg-panel-raised border-line hover:bg-wash text-ink-soft'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${selectedSeverities.includes('critical') ? 'bg-on-orange' : 'bg-orange'}`}></span>
                Critical ({severityCounts.critical})
              </button>

              <button
                type="button"
                onClick={() => onToggleSeverity('high')}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border font-['JetBrains_Mono'] text-[11px] font-semibold transition-all ${
                  selectedSeverities.includes('high')
                    ? 'bg-cream-fill border-cream-fill text-on-cream shadow-2xs'
                    : 'bg-panel-raised border-line hover:bg-wash text-ink-soft'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${selectedSeverities.includes('high') ? 'bg-on-cream' : 'bg-cream'}`}></span>
                High ({severityCounts.high})
              </button>

              <button
                type="button"
                onClick={() => onToggleSeverity('info')}
                className={`flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-lg border font-['JetBrains_Mono'] text-[11px] font-semibold transition-all ${
                  selectedSeverities.includes('info')
                    ? 'bg-blue-tint border-blue-line text-blue shadow-2xs'
                    : 'bg-panel-raised border-line hover:bg-wash text-ink-soft'
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-blue"></span>
                Info ({severityCounts.info})
              </button>
            </div>
          </div>

          {/* Primary Jurisdiction */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-muted block mb-1.5">
              Primary Jurisdiction
            </span>
            <div className="space-y-1">
              {JURISDICTION_OPTIONS.map(({ code, label, note }) => (
                <label
                  key={code}
                  className="flex items-center justify-between gap-2 p-1.5 min-h-[40px] lg:min-h-0 rounded hover:bg-panel-raised cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedJurisdictions[code]}
                      onChange={() => onToggleJurisdiction(code)}
                      className="w-4 h-4 lg:w-3.5 lg:h-3.5 shrink-0 rounded bg-panel border-line-strong text-accent focus:ring-0 cursor-pointer accent-accent"
                    />
                    <span className="flex flex-col min-w-0">
                      <span className={`font-['Inter'] text-[12px] ${selectedJurisdictions[code] ? 'text-ink font-medium' : 'text-ink-soft'}`}>
                        {label}
                      </span>
                      {note && <span className="font-['Inter'] text-[11px] text-muted">{note}</span>}
                    </span>
                  </div>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-muted bg-wash px-1.5 py-0.5 rounded border border-line shrink-0">
                    {jurisdictionCounts[code]}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Sector / Domain */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-muted block mb-1.5">
              Sector / Domain
            </span>
            <div className="space-y-1">
              {SECTORS.map((sector) => (
                <label
                  key={sector}
                  className="flex items-center justify-between gap-2 p-1.5 min-h-[40px] lg:min-h-0 rounded hover:bg-panel-raised cursor-pointer transition-colors"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedSectors[sector]}
                      onChange={() => onToggleSector(sector)}
                      className="w-4 h-4 lg:w-3.5 lg:h-3.5 shrink-0 rounded bg-panel border-line-strong text-accent focus:ring-0 cursor-pointer accent-accent"
                    />
                    <span
                      className={`font-['Inter'] text-[12px] min-w-0 ${
                        selectedSectors[sector] ? 'text-ink font-medium' : 'text-ink-soft'
                      }`}
                    >
                      {sector}
                    </span>
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-muted bg-wash px-1.5 py-0.5 rounded border border-line shrink-0">
                    {sectorCounts[sector]}
                  </span>
                </label>
              ))}
              <p className="font-['Inter'] text-[11px] text-muted pt-1">
                A notice can have up to three sectors and is shown if any of them is ticked. Tags come from keyword rules; each notice says which words gave them.
              </p>
            </div>
          </div>

          {/* Instrument Format */}
          <div>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold uppercase tracking-wider text-muted block mb-1.5">
              Instrument Format
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Circulars' ? null : 'Circulars')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Circulars'
                    ? 'bg-accent text-on-accent border-accent shadow-2xs'
                    : 'bg-panel-raised border-line hover:bg-wash text-ink'
                }`}
              >
                Circulars ({formatCounts.Circulars || 0})
              </button>

              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Consultations' ? null : 'Consultations')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Consultations'
                    ? 'bg-accent text-on-accent border-accent shadow-2xs'
                    : 'bg-panel-raised border-line hover:bg-wash text-ink'
                }`}
              >
                Consultations ({formatCounts.Consultations || 0})
              </button>

              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Enforcement' ? null : 'Enforcement')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Enforcement'
                    ? 'bg-orange-fill text-on-orange border-orange-fill shadow-2xs'
                    : 'bg-panel-raised border-line hover:bg-wash text-orange'
                }`}
              >
                Enforcement ({formatCounts.Enforcement || 0})
              </button>

              <button
                type="button"
                onClick={() => onSelectFormat(selectedFormat === 'Guidelines' ? null : 'Guidelines')}
                className={`px-2 py-1 rounded border font-['JetBrains_Mono'] text-[11px] font-medium transition-all ${
                  selectedFormat === 'Guidelines'
                    ? 'bg-accent text-on-accent border-accent shadow-2xs'
                    : 'bg-panel-raised border-line hover:bg-wash text-ink-soft'
                }`}
              >
                Guidelines ({formatCounts.Guidelines || 0})
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Jurisdiction Mesh Card */}
      <div className="bg-panel border border-line rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="font-['Inter'] text-[13px] font-bold text-ink">
            Jurisdiction Mesh
          </span>
          <button
            onClick={onPingEndpoints}
            disabled={isPinging}
            className="flex items-center gap-1 font-['JetBrains_Mono'] text-[11px] text-accent hover:underline font-semibold disabled:opacity-60"
            title="Re-check the monitored endpoints"
          >
            <span className={`w-1.5 h-1.5 rounded-full bg-accent ${isPinging ? 'animate-ping' : ''}`}></span>
            {isPinging ? 'Checking...' : 'Check Now'}
          </button>
        </div>
        <p className="font-['Inter'] text-[12px] text-muted mb-2.5">
          Response time from the RegSonar server to each monitored source.
        </p>

        <div className="space-y-2">
          {endpoints.map((ep) => (
            <div key={ep.id} className="flex items-center justify-between text-[12px]" title={ep.detail}>
              <span className="text-ink-soft font-['Inter']">{ep.agency}</span>
              <span className={`font-['JetBrains_Mono'] text-[11px] font-semibold flex items-center gap-1 ${STATUS_STYLES[ep.status].text}`}>
                {ep.pingMs !== null && (
                  <>
                    <span>{ep.pingMs}ms</span>
                    <span className="text-muted">•</span>
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

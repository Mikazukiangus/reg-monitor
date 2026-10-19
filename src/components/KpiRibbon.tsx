import React from 'react';
import { STATUS_STYLES } from './modals/LiveEndpointsModal';
import type { EndpointMetric } from '../types/regulatory';
import { agencyName, endpointHealth, percentOf, type FeedFigures } from '../lib/feedStats';
import { CRITICAL_SCORE } from '../lib/impact';

interface KpiRibbonProps {
  onFilterBySeverity?: (severity: string) => void;
  onFilterByFormat?: (format: string) => void;
  figures: FeedFigures;
  activeFilter?: string;
  endpoints: EndpointMetric[];
}

export const KpiRibbon: React.FC<KpiRibbonProps> = ({
  onFilterBySeverity,
  onFilterByFormat,
  figures,
  activeFilter,
  endpoints
}) => {
  const { total: totalNoticesCount, critical: criticalCount, openConsultations: consultationsCount,
    closedConsultations: closedConsultationsCount, recent: recentCount, closingSoon: closingSoonCount } = figures;
  const { up: operational, issues: notOperational, checking, upPercent: operationalPct, overall } = endpointHealth(endpoints);
  const tone = STATUS_STYLES[overall];
  const pct = (n: number) => `${percentOf(n, totalNoticesCount)}%`;

  return (
    <div className="w-full px-4 sm:px-6 py-3 bg-wash border-b border-line shadow-xs">
      {/* Phones get one row of four small tiles (number and short label);
          the bars and side notes return from md up */}
      <div className="grid grid-cols-4 gap-2 md:gap-4">
        {/* Card 1: Updates Today */}
        <button
          type="button"
          aria-pressed={activeFilter === 'all'}
          onClick={() => onFilterBySeverity && onFilterBySeverity('all')}
          className={`flex flex-col text-left w-full p-2 md:p-3.5 bg-panel border rounded-lg shadow-xs hover:bg-panel-raised transition-all cursor-pointer ${
            activeFilter === 'all' ? 'border-accent ring-1 ring-accent/30' : 'border-line'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[10px] md:text-[11px] text-muted uppercase tracking-wider font-medium">
              <span className="md:hidden">7 days</span><span className="max-md:hidden">Last 7 Days</span>
            </span>
          </div>
          <div className="flex items-baseline gap-2 md:mt-1">
            <span className="font-['Hanken_Grotesk'] text-[20px] md:text-[24px] text-ink font-bold leading-tight">
              {recentCount}
            </span>
            <span className="max-md:hidden font-['Inter'] text-[12px] text-muted">
              of {totalNoticesCount} notices loaded
            </span>
          </div>
          <div className="max-md:hidden w-full bg-wash-mid h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-green-dot h-full rounded-full" style={{ width: pct(recentCount) }}></div>
          </div>
        </button>

        {/* Card 2: Critical Impact */}
        <button
          type="button"
          aria-pressed={activeFilter === 'critical'}
          onClick={() => onFilterBySeverity && onFilterBySeverity('critical')}
          className={`flex flex-col text-left w-full p-2 md:p-3.5 bg-panel border rounded-lg shadow-xs hover:bg-panel-raised transition-all cursor-pointer relative overflow-hidden ${
            activeFilter === 'critical' ? 'border-orange ring-1 ring-orange/30' : 'border-line'
          }`}
        >
          <div className="max-md:hidden absolute -right-4 -bottom-4 w-16 h-16 bg-orange/5 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[10px] md:text-[11px] text-orange uppercase tracking-wider font-semibold">
              Critical<span className="max-md:hidden"> Impact</span>
            </span>
            <span className="max-md:hidden font-['JetBrains_Mono'] text-[10px] font-semibold text-muted" title="Critical means a date close at hand: a consultation closing within 14 days, or rules taking effect within 30 days">
              Score ≥ {CRITICAL_SCORE}
            </span>
          </div>
          <div className="flex items-baseline gap-2 md:mt-1">
            <span className="font-['Hanken_Grotesk'] text-[20px] md:text-[24px] text-ink font-bold leading-tight">
              {criticalCount}
            </span>
            <span className="max-md:hidden font-['Inter'] text-[12px] text-muted">notices</span>
          </div>
          <div className="max-md:hidden w-full bg-wash-mid h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-orange h-full rounded-full" style={{ width: pct(criticalCount) }}></div>
          </div>
        </button>

        {/* Card 3: Consultations */}
        <button
          type="button"
          aria-pressed={activeFilter === 'consultations'}
          onClick={() => onFilterByFormat && onFilterByFormat('Consultations')}
          className={`flex flex-col text-left w-full p-2 md:p-3.5 bg-panel border rounded-lg shadow-xs hover:bg-panel-raised transition-all cursor-pointer ${
            activeFilter === 'consultations' ? 'border-blue ring-1 ring-blue/30' : 'border-line'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[10px] md:text-[11px] text-blue uppercase tracking-wider font-semibold">
              <span className="md:hidden">Consults</span><span className="max-md:hidden">Consultations</span>
            </span>
            <span className="max-md:hidden font-['JetBrains_Mono'] text-[10px] font-semibold text-blue bg-blue-tint border border-blue-line px-1.5 py-0.5 rounded">
              {closingSoonCount} closing ≤ 14d
            </span>
          </div>
          <div className="flex items-baseline gap-2 md:mt-1">
            <span className="font-['Hanken_Grotesk'] text-[20px] md:text-[24px] text-ink font-bold leading-tight">
              {consultationsCount}
            </span>
            <span className="max-md:hidden font-['Inter'] text-[12px] text-muted">
              open for comment{closedConsultationsCount > 0 ? ` · ${closedConsultationsCount} closed` : ''}
            </span>
          </div>
          <div className="max-md:hidden w-full bg-wash-mid h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-blue h-full rounded-full" style={{ width: pct(consultationsCount) }}></div>
          </div>
        </button>

        {/* Card 4: Gateways Active */}
        <div className="flex flex-col p-2 md:p-3.5 bg-panel border border-line rounded-lg shadow-xs hover:bg-panel-raised transition-colors">
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[10px] md:text-[11px] text-muted uppercase tracking-wider font-medium">
              <span className="md:hidden">Sources</span><span className="max-md:hidden">Gateways Active</span>
            </span>
            <span className={`max-md:hidden flex items-center font-['JetBrains_Mono'] text-[10px] font-semibold ${tone.text}`}>
              {checking ? 'Checking...' : `${operational.length}/${endpoints.length} up`}
            </span>
          </div>
          <div className="flex items-baseline gap-2 md:mt-1">
            <span className="font-['Hanken_Grotesk'] text-[20px] md:text-[24px] text-ink font-bold leading-tight">
              {operational.length}
              <span className={`md:hidden text-[13px] ${tone.text}`}>/{endpoints.length}</span>
            </span>
            <span className="max-md:hidden font-['Inter'] text-[12px] text-muted truncate">
              {notOperational.length > 0
                ? `Issues: ${notOperational.map(e => agencyName(e.agency)).join(', ')}`
                : 'of monitored sources'}
            </span>
          </div>
          <div className="max-md:hidden w-full bg-wash-mid h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className={`${tone.dot} h-full rounded-full`} style={{ width: `${operationalPct}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

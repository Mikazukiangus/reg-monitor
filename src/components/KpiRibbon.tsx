import React from 'react';
import { EndpointMetric, STATUS_STYLES } from './modals/LiveEndpointsModal';
import { CRITICAL_SCORE } from '../lib/impact';

interface KpiRibbonProps {
  onFilterBySeverity?: (severity: string) => void;
  onFilterByFormat?: (format: string) => void;
  totalNoticesCount: number;
  criticalCount: number;
  // Consultations still open for comment, and those whose closing date has passed
  consultationsCount: number;
  closedConsultationsCount: number;
  // Notices published in the last 7 days
  recentCount: number;
  // Consultations with a date in the next 14 days
  closingSoonCount: number;
  activeFilter?: string;
  endpoints: EndpointMetric[];
}

export const KpiRibbon: React.FC<KpiRibbonProps> = ({
  onFilterBySeverity,
  onFilterByFormat,
  totalNoticesCount,
  criticalCount,
  consultationsCount,
  closedConsultationsCount,
  recentCount,
  closingSoonCount,
  activeFilter,
  endpoints
}) => {
  const operational = endpoints.filter(e => e.status === 'Operational');
  const notOperational = endpoints.filter(e => e.status !== 'Operational' && e.status !== 'Checking');
  const checking = endpoints.some(e => e.status === 'Checking');
  const tone = checking ? STATUS_STYLES.Checking : notOperational.length === 0 ? STATUS_STYLES.Operational : STATUS_STYLES.Degraded;
  const pct = (n: number) => `${totalNoticesCount ? Math.round((n / totalNoticesCount) * 100) : 0}%`;
  const operationalPct = endpoints.length ? Math.round((operational.length / endpoints.length) * 100) : 0;

  return (
    <div className="w-full px-4 sm:px-6 py-3 bg-wash border-b border-line shadow-xs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Updates Today */}
        <button
          type="button"
          aria-pressed={activeFilter === 'all'}
          onClick={() => onFilterBySeverity && onFilterBySeverity('all')}
          className={`flex flex-col text-left w-full p-3.5 bg-panel border rounded-lg shadow-xs hover:bg-panel-raised transition-all cursor-pointer ${
            activeFilter === 'all' ? 'border-accent ring-1 ring-accent/30' : 'border-line'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-muted uppercase tracking-wider font-medium">
              Last 7 Days
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-ink font-bold">
              {recentCount}
            </span>
            <span className="font-['Inter'] text-[12px] text-muted">
              of {totalNoticesCount} notices loaded
            </span>
          </div>
          <div className="w-full bg-wash-mid h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-green-dot h-full rounded-full" style={{ width: pct(recentCount) }}></div>
          </div>
        </button>

        {/* Card 2: Critical Impact */}
        <button
          type="button"
          aria-pressed={activeFilter === 'critical'}
          onClick={() => onFilterBySeverity && onFilterBySeverity('critical')}
          className={`flex flex-col text-left w-full p-3.5 bg-panel border rounded-lg shadow-xs hover:bg-panel-raised transition-all cursor-pointer relative overflow-hidden ${
            activeFilter === 'critical' ? 'border-orange ring-1 ring-orange/30' : 'border-line'
          }`}
        >
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-orange/5 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-orange uppercase tracking-wider font-semibold">
              Critical Impact
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-muted" title="Critical means a date close at hand: a consultation closing within 14 days, or rules taking effect within 30 days">
              Score ≥ {CRITICAL_SCORE}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-ink font-bold">
              {criticalCount}
            </span>
            <span className="font-['Inter'] text-[12px] text-muted">notices</span>
          </div>
          <div className="w-full bg-wash-mid h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-orange h-full rounded-full" style={{ width: pct(criticalCount) }}></div>
          </div>
        </button>

        {/* Card 3: Consultations */}
        <button
          type="button"
          aria-pressed={activeFilter === 'consultations'}
          onClick={() => onFilterByFormat && onFilterByFormat('Consultations')}
          className={`flex flex-col text-left w-full p-3.5 bg-panel border rounded-lg shadow-xs hover:bg-panel-raised transition-all cursor-pointer ${
            activeFilter === 'consultations' ? 'border-blue ring-1 ring-blue/30' : 'border-line'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-blue uppercase tracking-wider font-semibold">
              Consultations
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-blue bg-blue-tint border border-blue-line px-1.5 py-0.5 rounded">
              {closingSoonCount} closing ≤ 14d
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-ink font-bold">
              {consultationsCount}
            </span>
            <span className="font-['Inter'] text-[12px] text-muted">
              open for comment{closedConsultationsCount > 0 ? ` · ${closedConsultationsCount} closed` : ''}
            </span>
          </div>
          <div className="w-full bg-wash-mid h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-blue h-full rounded-full" style={{ width: pct(consultationsCount) }}></div>
          </div>
        </button>

        {/* Card 4: Gateways Active */}
        <div className="flex flex-col p-3.5 bg-panel border border-line rounded-lg shadow-xs hover:bg-panel-raised transition-colors">
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-muted uppercase tracking-wider font-medium">
              Gateways Active
            </span>
            <span className={`flex items-center font-['JetBrains_Mono'] text-[10px] font-semibold ${tone.text}`}>
              {checking ? 'Checking...' : `${operational.length}/${endpoints.length} up`}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-ink font-bold">
              {operational.length}
            </span>
            <span className="font-['Inter'] text-[12px] text-muted truncate">
              {notOperational.length > 0
                ? `Issues: ${notOperational.map(e => e.agency.replace(/ \(.*\)$/, '')).join(', ')}`
                : 'of monitored sources'}
            </span>
          </div>
          <div className="w-full bg-wash-mid h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className={`${tone.dot} h-full rounded-full`} style={{ width: `${operationalPct}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

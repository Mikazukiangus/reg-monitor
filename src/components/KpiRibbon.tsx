import React from 'react';
import { EndpointMetric, STATUS_STYLES } from './modals/LiveEndpointsModal';

interface KpiRibbonProps {
  onFilterBySeverity?: (severity: string) => void;
  onFilterByFormat?: (format: string) => void;
  totalNoticesCount: number;
  criticalCount: number;
  consultationsCount: number;
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
    <div className="w-full px-4 sm:px-6 py-3 bg-[#F5F1E8] border-b border-[#E5DFD5] shadow-xs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Updates Today */}
        <div
          onClick={() => onFilterBySeverity && onFilterBySeverity('all')}
          className={`flex flex-col p-3.5 bg-[#FFFFFF] border rounded-lg shadow-xs hover:bg-[#FAF8F5] transition-all cursor-pointer ${
            activeFilter === 'all' ? 'border-[#0D5C63] ring-1 ring-[#0D5C63]/30' : 'border-[#E5DFD5]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] uppercase tracking-wider font-medium">
              Last 7 Days
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1E1B18] font-bold">
              {recentCount}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#857F74]">
              of {totalNoticesCount} live notices
            </span>
          </div>
          <div className="w-full bg-[#EFEBE0] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-[#0D5C63] h-full rounded-full" style={{ width: pct(recentCount) }}></div>
          </div>
        </div>

        {/* Card 2: Critical Impact */}
        <div
          onClick={() => onFilterBySeverity && onFilterBySeverity('critical')}
          className={`flex flex-col p-3.5 bg-[#FFFFFF] border rounded-lg shadow-xs hover:bg-[#FAF8F5] transition-all cursor-pointer relative overflow-hidden ${
            activeFilter === 'critical' ? 'border-[#DC2626] ring-1 ring-[#DC2626]/30' : 'border-[#E5DFD5]'
          }`}
        >
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-[#DC2626]/5 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#DC2626] uppercase tracking-wider font-semibold">
              Critical Impact
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-[#857F74]" title="Impact score is a heuristic by document type">
              Score ≥ 8.5
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1E1B18] font-bold">
              {criticalCount}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#857F74]">notices</span>
          </div>
          <div className="w-full bg-[#EFEBE0] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-[#DC2626] h-full rounded-full" style={{ width: pct(criticalCount) }}></div>
          </div>
        </div>

        {/* Card 3: Consultations */}
        <div
          onClick={() => onFilterByFormat && onFilterByFormat('Consultations')}
          className={`flex flex-col p-3.5 bg-[#FFFFFF] border rounded-lg shadow-xs hover:bg-[#FAF8F5] transition-all cursor-pointer ${
            activeFilter === 'consultations' ? 'border-[#0D5C63] ring-1 ring-[#0D5C63]/30' : 'border-[#E5DFD5]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#0D5C63] uppercase tracking-wider font-semibold">
              Consultations
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-[#0D5C63] bg-[#E6F4F4] border border-[#B2DFDB] px-1.5 py-0.5 rounded">
              {closingSoonCount} closing ≤ 14d
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1E1B18] font-bold">
              {consultationsCount}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#857F74]">responses pending</span>
          </div>
          <div className="w-full bg-[#EFEBE0] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-[#0D5C63] h-full rounded-full" style={{ width: pct(consultationsCount) }}></div>
          </div>
        </div>

        {/* Card 4: Gateways Active */}
        <div className="flex flex-col p-3.5 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg shadow-xs hover:bg-[#FAF8F5] transition-colors">
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] uppercase tracking-wider font-medium">
              Gateways Active
            </span>
            <span className={`flex items-center font-['JetBrains_Mono'] text-[10px] font-semibold ${tone.text}`}>
              {checking ? 'Checking...' : `${operational.length}/${endpoints.length} up`}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1E1B18] font-bold">
              {operational.length}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#857F74] truncate">
              {notOperational.length > 0
                ? `Issues: ${notOperational.map(e => e.agency.replace(/ \(.*\)$/, '')).join(', ')}`
                : 'of monitored sources'}
            </span>
          </div>
          <div className="w-full bg-[#EFEBE0] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className={`${tone.dot} h-full rounded-full`} style={{ width: `${operationalPct}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

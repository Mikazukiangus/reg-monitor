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
    <div className="w-full px-4 sm:px-6 py-3 bg-[#E3EBE6] border-b border-[#D3DDD7] shadow-xs">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Updates Today */}
        <div
          onClick={() => onFilterBySeverity && onFilterBySeverity('all')}
          className={`flex flex-col p-3.5 bg-[#FBFCFA] border rounded-lg shadow-xs hover:bg-[#F4F7F4] transition-all cursor-pointer ${
            activeFilter === 'all' ? 'border-[#1F4E79] ring-1 ring-[#1F4E79]/30' : 'border-[#D3DDD7]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#56636B] uppercase tracking-wider font-medium">
              Last 7 Days
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1D2630] font-bold">
              {recentCount}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#56636B]">
              of {totalNoticesCount} notices loaded
            </span>
          </div>
          <div className="w-full bg-[#D9E3DD] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-[#1F4E79] h-full rounded-full" style={{ width: pct(recentCount) }}></div>
          </div>
        </div>

        {/* Card 2: Critical Impact */}
        <div
          onClick={() => onFilterBySeverity && onFilterBySeverity('critical')}
          className={`flex flex-col p-3.5 bg-[#FBFCFA] border rounded-lg shadow-xs hover:bg-[#F4F7F4] transition-all cursor-pointer relative overflow-hidden ${
            activeFilter === 'critical' ? 'border-[#A8432F] ring-1 ring-[#A8432F]/30' : 'border-[#D3DDD7]'
          }`}
        >
          <div className="absolute -right-4 -bottom-4 w-16 h-16 bg-[#A8432F]/5 rounded-full blur-xl pointer-events-none"></div>
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#A8432F] uppercase tracking-wider font-semibold">
              Critical Impact
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-[#56636B]" title="Impact score is a heuristic by document type">
              Score ≥ 8.5
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1D2630] font-bold">
              {criticalCount}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#56636B]">notices</span>
          </div>
          <div className="w-full bg-[#D9E3DD] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-[#A8432F] h-full rounded-full" style={{ width: pct(criticalCount) }}></div>
          </div>
        </div>

        {/* Card 3: Consultations */}
        <div
          onClick={() => onFilterByFormat && onFilterByFormat('Consultations')}
          className={`flex flex-col p-3.5 bg-[#FBFCFA] border rounded-lg shadow-xs hover:bg-[#F4F7F4] transition-all cursor-pointer ${
            activeFilter === 'consultations' ? 'border-[#1F4E79] ring-1 ring-[#1F4E79]/30' : 'border-[#D3DDD7]'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#1F4E79] uppercase tracking-wider font-semibold">
              Consultations
            </span>
            <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-[#1F4E79] bg-[#D9E5EE] border border-[#B3C8D9] px-1.5 py-0.5 rounded">
              {closingSoonCount} closing ≤ 14d
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1D2630] font-bold">
              {consultationsCount}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#56636B]">responses pending</span>
          </div>
          <div className="w-full bg-[#D9E3DD] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-[#1F4E79] h-full rounded-full" style={{ width: pct(consultationsCount) }}></div>
          </div>
        </div>

        {/* Card 4: Gateways Active */}
        <div className="flex flex-col p-3.5 bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg shadow-xs hover:bg-[#F4F7F4] transition-colors">
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#56636B] uppercase tracking-wider font-medium">
              Gateways Active
            </span>
            <span className={`flex items-center font-['JetBrains_Mono'] text-[10px] font-semibold ${tone.text}`}>
              {checking ? 'Checking...' : `${operational.length}/${endpoints.length} up`}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1D2630] font-bold">
              {operational.length}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#56636B] truncate">
              {notOperational.length > 0
                ? `Issues: ${notOperational.map(e => e.agency.replace(/ \(.*\)$/, '')).join(', ')}`
                : 'of monitored sources'}
            </span>
          </div>
          <div className="w-full bg-[#D9E3DD] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className={`${tone.dot} h-full rounded-full`} style={{ width: `${operationalPct}%` }}></div>
          </div>
        </div>
      </div>
    </div>
  );
};

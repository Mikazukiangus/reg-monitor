import React from 'react';

interface KpiRibbonProps {
  onFilterBySeverity?: (severity: string) => void;
  onFilterByFormat?: (format: string) => void;
  totalNoticesCount: number;
  criticalCount: number;
  consultationsCount: number;
  activeFilter?: string;
}

export const KpiRibbon: React.FC<KpiRibbonProps> = ({
  onFilterBySeverity,
  onFilterByFormat,
  totalNoticesCount,
  criticalCount,
  consultationsCount,
  activeFilter
}) => {
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
              Updates Today
            </span>
            <span className="flex items-center text-[#15803D] font-['JetBrains_Mono'] text-[10px] font-semibold bg-[#DCFCE7] border border-[#BBF7D0] px-1.5 py-0.5 rounded">
              <span className="material-symbols-outlined text-xs mr-0.5">trending_up</span>
              +12% 7d avg
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1E1B18] font-bold">
              {totalNoticesCount || 38}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#857F74]">
              regulatory notices logged
            </span>
          </div>
          <div className="w-full bg-[#EFEBE0] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-[#0D5C63] h-full w-3/4 rounded-full"></div>
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
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#DC2626] animate-ping"></span>
              <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-[#DC2626]">
                Urgent Review
              </span>
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1E1B18] font-bold">
              {criticalCount || 4}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#857F74]">mandates active</span>
          </div>
          <div className="w-full bg-[#EFEBE0] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-[#DC2626] h-full w-1/3 rounded-full"></div>
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
              Closing ≤ 14d
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1E1B18] font-bold">
              {consultationsCount || 9}
            </span>
            <span className="font-['Inter'] text-[12px] text-[#857F74]">responses pending</span>
          </div>
          <div className="w-full bg-[#EFEBE0] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-[#0D5C63] h-full w-2/5 rounded-full"></div>
          </div>
        </div>

        {/* Card 4: Gateways Active */}
        <div className="flex flex-col p-3.5 bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg shadow-xs hover:bg-[#FAF8F5] transition-colors">
          <div className="flex items-center justify-between">
            <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] uppercase tracking-wider font-medium">
              Gateways Active
            </span>
            <span className="flex items-center text-[#15803D] font-['JetBrains_Mono'] text-[10px] font-semibold">
              <span className="material-symbols-outlined text-xs mr-0.5">verified</span>
              100% SLA
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-['Hanken_Grotesk'] text-[24px] text-[#1E1B18] font-bold">
              24
            </span>
            <span className="font-['Inter'] text-[12px] text-[#857F74] truncate">
              MAS, HKMA, ASIC, JFSA...
            </span>
          </div>
          <div className="w-full bg-[#EFEBE0] h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div className="bg-[#15803D] h-full w-full rounded-full"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

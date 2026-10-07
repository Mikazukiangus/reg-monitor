import React from 'react';
import { RegulatoryNotice } from '../types/regulatory';

export type ActiveTab =
  | 'feed'
  | 'radar'
  | 'horizon'
  | 'enforcement'
  | 'alert-rules';

interface NavigationProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  wireItems: RegulatoryNotice[];
  onSelectNotice: (id: string) => void;
}

const SEVERITY_DOT: Record<RegulatoryNotice['severity'], string> = {
  critical: 'bg-[#A8432F]',
  high: 'bg-[#6E5410]',
  info: 'bg-[#1F4E79]'
};

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  wireItems,
  onSelectNotice
}) => {
  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-[#EEF3EF]">
      {/* Tab Navigation Row */}
      <div className="h-10 w-full px-4 sm:px-6 bg-[#E3EBE6] border-b border-[#D3DDD7] flex items-center justify-between overflow-x-auto scrollbar-none">
        <nav className="flex items-center gap-1.5 h-full shrink-0">
          <button
            onClick={() => onTabChange('feed')}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'feed'
                ? 'bg-[#1F4E79] text-white shadow-xs'
                : 'text-[#3C4852] hover:text-[#1D2630] hover:bg-[#DCE4DF]'
            }`}
          >
            Live Regulatory Feed
          </button>

          <button
            onClick={() => onTabChange('radar')}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'radar'
                ? 'bg-[#1F4E79] text-white shadow-xs'
                : 'text-[#3C4852] hover:text-[#1D2630] hover:bg-[#DCE4DF]'
            }`}
          >
            APAC Regulatory Radar
          </button>

          <button
            onClick={() => onTabChange('horizon')}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'horizon'
                ? 'bg-[#1F4E79] text-white shadow-xs'
                : 'text-[#3C4852] hover:text-[#1D2630] hover:bg-[#DCE4DF]'
            }`}
          >
            Impact &amp; Horizon Tracker
          </button>

          <button
            onClick={() => onTabChange('enforcement')}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'enforcement'
                ? 'bg-[#1F4E79] text-white shadow-xs'
                : 'text-[#3C4852] hover:text-[#1D2630] hover:bg-[#DCE4DF]'
            }`}
          >
            Enforcement &amp; Sanctions
          </button>

          <button
            onClick={() => onTabChange('alert-rules')}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'alert-rules'
                ? 'bg-[#1F4E79] text-white shadow-xs'
                : 'text-[#3C4852] hover:text-[#1D2630] hover:bg-[#DCE4DF]'
            }`}
          >
            Custom Alert Rules
          </button>
        </nav>

        <div className="hidden md:flex items-center gap-1.5 text-[#56636B] font-['JetBrains_Mono'] text-[11px] shrink-0 font-medium">
          <span className="material-symbols-outlined text-sm">tune</span>
          <span>Jurisdiction: APAC Pinned</span>
        </div>
      </div>

      {/* Real-Time Wire Banner */}
      <div className="h-8 w-full px-4 sm:px-6 bg-[#D9E3DD] border-b border-[#D3DDD7] flex items-center overflow-hidden">
        <div className="flex items-center gap-1 shrink-0 pr-4 border-r border-[#C5D2CA] mr-4">
          <span className="material-symbols-outlined text-[#1F4E79] text-sm animate-pulse">
            bolt
          </span>
          <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-[#56636B] uppercase tracking-wider">
            Latest
          </span>
        </div>

        <div className="flex items-center gap-6 overflow-x-hidden whitespace-nowrap text-[#3C4852] font-['Inter'] text-[12px]">
          {wireItems.length === 0 && <span className="text-[#56636B]">Waiting for first sync...</span>}
          {wireItems.map((n, idx) => (
            <React.Fragment key={n.id}>
              {idx > 0 && <span className="text-[#56636B]">•</span>}
              <span
                onClick={() => onSelectNotice(n.id)}
                className="flex items-center gap-1.5 cursor-pointer hover:text-[#1D2630] transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[n.severity]}`}></span>
                <strong className="text-[#1D2630] font-medium">{n.regulator}:</strong> {n.title} ({n.issuedTimeAgo})
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

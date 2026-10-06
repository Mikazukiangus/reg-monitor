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
  critical: 'bg-[#DC2626]',
  high: 'bg-[#B45309]',
  info: 'bg-[#0D5C63]'
};

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onTabChange,
  wireItems,
  onSelectNotice
}) => {
  return (
    <div className="fixed top-14 left-0 right-0 z-40 bg-[#FAF7F2]">
      {/* Tab Navigation Row */}
      <div className="h-10 w-full px-4 sm:px-6 bg-[#F5F1E8] border-b border-[#E5DFD5] flex items-center justify-between overflow-x-auto scrollbar-none">
        <nav className="flex items-center gap-1.5 h-full shrink-0">
          <button
            onClick={() => onTabChange('feed')}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'feed'
                ? 'bg-[#0D5C63] text-white shadow-xs'
                : 'text-[#57534E] hover:text-[#1E1B18] hover:bg-[#EAE4D7]'
            }`}
          >
            Live Regulatory Feed
          </button>

          <button
            onClick={() => onTabChange('radar')}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'radar'
                ? 'bg-[#0D5C63] text-white shadow-xs'
                : 'text-[#57534E] hover:text-[#1E1B18] hover:bg-[#EAE4D7]'
            }`}
          >
            APAC Regulatory Radar
          </button>

          <button
            onClick={() => onTabChange('horizon')}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'horizon'
                ? 'bg-[#0D5C63] text-white shadow-xs'
                : 'text-[#57534E] hover:text-[#1E1B18] hover:bg-[#EAE4D7]'
            }`}
          >
            Impact &amp; Horizon Tracker
          </button>

          <button
            onClick={() => onTabChange('enforcement')}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'enforcement'
                ? 'bg-[#0D5C63] text-white shadow-xs'
                : 'text-[#57534E] hover:text-[#1E1B18] hover:bg-[#EAE4D7]'
            }`}
          >
            Enforcement &amp; Sanctions
          </button>

          <button
            onClick={() => onTabChange('alert-rules')}
            className={`px-3.5 py-1.5 transition-colors shrink-0 text-[11px] font-semibold rounded-lg shadow-2xs ${
              activeTab === 'alert-rules'
                ? 'bg-[#0D5C63] text-white shadow-xs'
                : 'text-[#57534E] hover:text-[#1E1B18] hover:bg-[#EAE4D7]'
            }`}
          >
            Custom Alert Rules
          </button>
        </nav>

        <div className="hidden md:flex items-center gap-1.5 text-[#857F74] font-['JetBrains_Mono'] text-[11px] shrink-0 font-medium">
          <span className="material-symbols-outlined text-sm">tune</span>
          <span>Jurisdiction: APAC Pinned</span>
        </div>
      </div>

      {/* Real-Time Wire Banner */}
      <div className="h-8 w-full px-4 sm:px-6 bg-[#EFEBE0] border-b border-[#E5DFD5] flex items-center overflow-hidden">
        <div className="flex items-center gap-1 shrink-0 pr-4 border-r border-[#D8D0C2] mr-4">
          <span className="material-symbols-outlined text-[#0D5C63] text-sm animate-pulse">
            bolt
          </span>
          <span className="font-['JetBrains_Mono'] text-[10px] font-semibold text-[#857F74] uppercase tracking-wider">
            Latest
          </span>
        </div>

        <div className="flex items-center gap-6 overflow-x-hidden whitespace-nowrap text-[#57534E] font-['Inter'] text-[12px]">
          {wireItems.length === 0 && <span className="text-[#857F74]">Waiting for first sync...</span>}
          {wireItems.map((n, idx) => (
            <React.Fragment key={n.id}>
              {idx > 0 && <span className="text-[#857F74]">•</span>}
              <span
                onClick={() => onSelectNotice(n.id)}
                className="flex items-center gap-1.5 cursor-pointer hover:text-[#1E1B18] transition-colors"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${SEVERITY_DOT[n.severity]}`}></span>
                <strong className="text-[#1E1B18] font-medium">{n.regulator}:</strong> {n.title} ({n.issuedTimeAgo})
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

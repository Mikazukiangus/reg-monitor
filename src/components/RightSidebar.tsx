import React from 'react';
import { DeadlineItem } from '../types/regulatory';
import { EndpointMetric, STATUS_STYLES } from './modals/LiveEndpointsModal';

interface RightSidebarProps {
  deadlines: DeadlineItem[];
  onOpenExportCsv: () => void;
  onOpenExportJson: () => void;
  onSelectDeadlineNotice: (noticeId: string) => void;
  onOpenLiveEndpointsModal?: () => void;
  onTriggerSync?: () => void;
  isSyncing?: boolean;
  endpoints?: EndpointMetric[];
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  deadlines,
  onOpenExportCsv,
  onOpenExportJson,
  onSelectDeadlineNotice,
  onOpenLiveEndpointsModal,
  onTriggerSync,
  isSyncing = false,
  endpoints = []
}) => {
  const operationalCount = endpoints.filter(e => e.status === 'Operational').length;

  return (
    <aside className="lg:col-span-3 flex flex-col gap-3">
      {/* Deadlines Radar */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-[#E5DFD5]">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#0D5C63] text-lg">alarm</span>
            <span className="font-['Hanken_Grotesk'] text-[16px] text-[#1E1B18] font-bold">
              Deadlines Radar
            </span>
          </div>
          <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] font-medium">
            From source documents
          </span>
        </div>

        <div className="space-y-2">
          {deadlines.length === 0 && (
            <p className="font-['Inter'] text-[12px] text-[#857F74]">
              No upcoming dates found in the current notices.
            </p>
          )}
          {deadlines.slice(0, 4).map((item) => (
            <div
              key={item.id}
              onClick={() => item.noticeId && onSelectDeadlineNotice(item.noticeId)}
              className="p-2.5 bg-[#FAF7F2] border border-[#EAE4D7] rounded flex items-center justify-between gap-2 hover:bg-[#F5F1E8] cursor-pointer transition-colors"
            >
              <div className="min-w-0">
                <span className="font-['JetBrains_Mono'] text-[11px] font-bold text-[#1E1B18] block line-clamp-2">
                  {item.title}
                </span>
                <span className="font-['Inter'] text-[11px] text-[#857F74]">
                  {item.subtitle}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className={`font-['Hanken_Grotesk'] text-[18px] font-bold block ${item.textColorClass}`}>
                  {item.daysRemaining}d
                </span>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74] block">
                  {item.dateStr}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live Feeds Sentinel */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#E5DFD5]">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#0D5C63] text-lg">sensors</span>
            <span className="font-['Hanken_Grotesk'] text-[15px] text-[#1E1B18] font-bold">
              Live Feeds Gateway
            </span>
          </div>
          <span className={`font-['JetBrains_Mono'] text-[10px] font-bold px-2 py-0.5 rounded border flex items-center gap-1 ${
            operationalCount === endpoints.length ? STATUS_STYLES.Operational.badge : STATUS_STYLES.Degraded.badge
          }`}>
            {operationalCount}/{endpoints.length} Up
          </span>
        </div>

        <div className="space-y-1.5 mb-3 text-[11px]">
          {endpoints.map((ep) => (
            <div key={ep.id} className="flex items-center justify-between py-1 border-b border-[#FAF7F2] last:border-b-0" title={ep.detail}>
              <span className="font-['JetBrains_Mono'] text-[#57534E]">{ep.name}</span>
              <span className={`font-['JetBrains_Mono'] font-bold ${STATUS_STYLES[ep.status].text}`}>
                {ep.status}
                {ep.statusCode ? ` (${ep.statusCode})` : ''}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {onOpenLiveEndpointsModal && (
            <button
              onClick={onOpenLiveEndpointsModal}
              className="flex-1 py-1.5 bg-[#FAF8F5] hover:bg-[#F5F1E8] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded transition-colors flex items-center justify-center gap-1 shadow-2xs"
            >
              <span className="material-symbols-outlined text-sm text-[#0D5C63]">hub</span>
              <span>Manage APIs</span>
            </button>
          )}

          {onTriggerSync && (
            <button
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="flex-1 py-1.5 bg-[#0D5C63] hover:bg-[#0A474D] text-white font-['Inter'] text-[11px] font-semibold rounded transition-colors flex items-center justify-center gap-1 shadow-xs disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-sm ${isSyncing ? 'animate-spin' : ''}`}>
                sync
              </span>
              <span>{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Compliance Pipeline Sync */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-3.5 shadow-xs">
        <span className="font-['Inter'] text-[13px] text-[#1E1B18] font-bold block mb-1">
          Export Notices
        </span>
        <p className="font-['Inter'] text-[12px] text-[#857F74] mb-3 leading-relaxed">
          Download the currently filtered notices, including source links and quoted key points.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={onOpenExportCsv}
            className="flex items-center justify-center gap-1.5 py-2 bg-[#FAF8F5] hover:bg-[#F5F1E8] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-base text-[#0D5C63]">table_view</span>
            <span>Excel / CSV</span>
          </button>

          <button
            onClick={onOpenExportJson}
            className="flex items-center justify-center gap-1.5 py-2 bg-[#FAF8F5] hover:bg-[#F5F1E8] border border-[#E5DFD5] text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-base text-[#0D5C63]">code</span>
            <span>JSON Feed</span>
          </button>
        </div>

      </div>

    </aside>
  );
};

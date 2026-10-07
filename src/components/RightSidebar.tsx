import React from 'react';
import { DeadlineItem } from '../types/regulatory';
import { EndpointMetric, STATUS_STYLES } from './modals/LiveEndpointsModal';
import { LiquidityChart } from './LiquidityChart';

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
      <div className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-2.5 pb-1 border-b border-[#D3DDD7]">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#1F4E79] text-lg">alarm</span>
            <span className="font-['Hanken_Grotesk'] text-[16px] text-[#1D2630] font-bold">
              Deadlines Radar
            </span>
          </div>
          <span className="font-['JetBrains_Mono'] text-[11px] text-[#56636B] font-medium">
            From source documents
          </span>
        </div>

        <div className="space-y-2">
          {deadlines.length === 0 && (
            <p className="font-['Inter'] text-[12px] text-[#56636B]">
              No upcoming dates found in the current notices.
            </p>
          )}
          {deadlines.slice(0, 4).map((item) => (
            <div
              key={item.id}
              onClick={() => item.noticeId && onSelectDeadlineNotice(item.noticeId)}
              className="p-2.5 bg-[#EEF3EF] border border-[#DCE4DF] rounded flex items-center justify-between gap-2 hover:bg-[#E3EBE6] cursor-pointer transition-colors"
            >
              <div className="min-w-0">
                <span className="font-['JetBrains_Mono'] text-[11px] font-bold text-[#1D2630] block line-clamp-2">
                  {item.title}
                </span>
                <span className="font-['Inter'] text-[11px] text-[#56636B]">
                  {item.subtitle}
                </span>
              </div>
              <div className="text-right shrink-0">
                <span className={`font-['Hanken_Grotesk'] text-[18px] font-bold block ${item.textColorClass}`}>
                  {item.daysRemaining}d
                </span>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B] block">
                  {item.dateStr}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <LiquidityChart />

      {/* Live Feeds Sentinel */}
      <div className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg p-3.5 shadow-xs">
        <div className="flex items-center justify-between mb-2 pb-1 border-b border-[#D3DDD7]">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#1F4E79] text-lg">sensors</span>
            <span className="font-['Hanken_Grotesk'] text-[15px] text-[#1D2630] font-bold">
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
            <div key={ep.id} className="flex items-center justify-between py-1 border-b border-[#EEF3EF] last:border-b-0" title={ep.detail}>
              <span className="font-['JetBrains_Mono'] text-[#3C4852]">{ep.name}</span>
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
              className="flex-1 py-1.5 bg-[#F4F7F4] hover:bg-[#E3EBE6] border border-[#D3DDD7] text-[#1D2630] font-['Inter'] text-[11px] font-semibold rounded transition-colors flex items-center justify-center gap-1 shadow-2xs"
            >
              <span className="material-symbols-outlined text-sm text-[#1F4E79]">hub</span>
              <span>Manage APIs</span>
            </button>
          )}

          {onTriggerSync && (
            <button
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="flex-1 py-1.5 bg-[#1F4E79] hover:bg-[#163A5C] text-white font-['Inter'] text-[11px] font-semibold rounded transition-colors flex items-center justify-center gap-1 shadow-xs disabled:opacity-60"
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
      <div className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg p-3.5 shadow-xs">
        <span className="font-['Inter'] text-[13px] text-[#1D2630] font-bold block mb-1">
          Export Notices
        </span>
        <p className="font-['Inter'] text-[12px] text-[#56636B] mb-3 leading-relaxed">
          Download the currently filtered notices, including source links and quoted key points.
        </p>

        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            onClick={onOpenExportCsv}
            className="flex items-center justify-center gap-1.5 py-2 bg-[#F4F7F4] hover:bg-[#E3EBE6] border border-[#D3DDD7] text-[#1D2630] font-['Inter'] text-[11px] font-semibold rounded transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-base text-[#1F4E79]">table_view</span>
            <span>Excel / CSV</span>
          </button>

          <button
            onClick={onOpenExportJson}
            className="flex items-center justify-center gap-1.5 py-2 bg-[#F4F7F4] hover:bg-[#E3EBE6] border border-[#D3DDD7] text-[#1D2630] font-['Inter'] text-[11px] font-semibold rounded transition-colors shadow-2xs"
          >
            <span className="material-symbols-outlined text-base text-[#1F4E79]">code</span>
            <span>JSON Feed</span>
          </button>
        </div>

      </div>

    </aside>
  );
};

import React, { useState } from 'react';
import { DeadlineItem, TrendBrief } from '../types/regulatory';

interface RightSidebarProps {
  deadlines: DeadlineItem[];
  trendBriefs: TrendBrief[];
  onOpenFullDigest: () => void;
  onOpenExportCsv: () => void;
  onOpenExportJson: () => void;
  onOpenWebhookModal: () => void;
  onSelectDeadlineNotice: (noticeId: string) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  deadlines,
  trendBriefs,
  onOpenFullDigest,
  onOpenExportCsv,
  onOpenExportJson,
  onOpenWebhookModal,
  onSelectDeadlineNotice
}) => {
  const [copiedAuditId, setCopiedAuditId] = useState(false);
  const auditId = 'RS-APAC-SYNC-99201-LIVE';

  const handleCopyAuditId = () => {
    navigator.clipboard.writeText(auditId);
    setCopiedAuditId(true);
    setTimeout(() => setCopiedAuditId(false), 2000);
  };

  return (
    <aside className="lg:col-span-3 flex flex-col gap-3">
      {/* AI Brief of the Day */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-3.5 shadow-xs relative overflow-hidden">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#0D5C63] text-lg">psychology</span>
            <span className="font-['Hanken_Grotesk'] text-[16px] text-[#1E1B18] font-bold">
              AI Brief of the Day
            </span>
          </div>
          <span className="font-['JetBrains_Mono'] text-[10px] font-bold bg-[#E6F4F1] text-[#0D5C63] border border-[#BCE3DE] px-1.5 py-0.5 rounded">
            08:00 SGT
          </span>
        </div>

        <div className="space-y-2 mb-3">
          {trendBriefs.slice(0, 2).map((trend) => (
            <div key={trend.id} className="p-2.5 bg-[#FAF7F2] border border-[#EAE4D7] rounded">
              <span className={`font-['JetBrains_Mono'] text-[11px] font-bold block mb-1 ${trend.severityColor}`}>
                {trend.tag}
              </span>
              <p className="font-['Inter'] text-[12px] text-[#57534E] leading-relaxed">
                {trend.summary}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-[#E5DFD5]">
          <span className="font-['JetBrains_Mono'] text-[10px] text-[#857F74]">
            Generated across 24 APAC feeds
          </span>
          <button
            onClick={onOpenFullDigest}
            className="font-['Inter'] text-[11px] font-bold text-[#0D5C63] hover:text-[#09454A] transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>Full Digest</span>
            <span className="material-symbols-outlined text-sm">arrow_forward</span>
          </button>
        </div>
      </div>

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
            APAC Window
          </span>
        </div>

        <div className="space-y-2">
          {deadlines.slice(0, 3).map((item) => (
            <div
              key={item.id}
              onClick={() => item.noticeId && onSelectDeadlineNotice(item.noticeId)}
              className="p-2.5 bg-[#FAF7F2] border border-[#EAE4D7] rounded flex items-center justify-between hover:bg-[#F5F1E8] cursor-pointer transition-colors"
            >
              <div>
                <span className="font-['JetBrains_Mono'] text-[11px] font-bold text-[#1E1B18] block">
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

      {/* Compliance Pipeline Sync */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-lg p-3.5 shadow-xs">
        <span className="font-['Inter'] text-[13px] text-[#1E1B18] font-bold block mb-1">
          Compliance Pipeline Sync
        </span>
        <p className="font-['Inter'] text-[12px] text-[#857F74] mb-3 leading-relaxed">
          Forward real-time filtered feed directly to internal risk registers and legal matter management.
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

        <button
          onClick={onOpenWebhookModal}
          className="w-full py-2 bg-[#FAF8F5] hover:bg-[#F5F1E8] border border-[#E5DFD5] text-[#57534E] hover:text-[#1E1B18] font-['Inter'] text-[11px] font-semibold rounded flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
        >
          <span className="material-symbols-outlined text-base">webhook</span>
          <span>Configure Webhook &amp; Slack Alerts</span>
        </button>
      </div>

      {/* Statutory Audit Log ID */}
      <div
        onClick={handleCopyAuditId}
        className="bg-[#F5F1E8] border border-[#E5DFD5] rounded-lg p-3 text-center cursor-pointer hover:border-[#15803D]/60 transition-colors group relative shadow-2xs"
        title="Click to copy Statutory Audit Log ID"
      >
        <div className="w-8 h-8 rounded-full bg-[#DCFCE7] border border-[#86EFAC] text-[#15803D] flex items-center justify-center mx-auto mb-1 group-hover:scale-105 transition-transform">
          <span className="material-symbols-outlined text-base">policy</span>
        </div>
        <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74] block font-medium">
          Statutory Audit Log ID
        </span>
        <span className="font-['JetBrains_Mono'] text-[11px] font-bold text-[#1E1B18] group-hover:text-[#15803D] transition-colors flex items-center justify-center gap-1">
          {auditId}
          <span className="material-symbols-outlined text-xs">
            {copiedAuditId ? 'done' : 'content_copy'}
          </span>
        </span>
        {copiedAuditId && (
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#15803D] text-white font-['JetBrains_Mono'] text-[10px] font-bold px-2 py-0.5 rounded shadow">
            Copied to Clipboard!
          </span>
        )}
      </div>
    </aside>
  );
};

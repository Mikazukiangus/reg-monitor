import React, { useState } from 'react';
import { RegulatoryNotice } from '../../types/regulatory';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  notices: RegulatoryNotice[];
  initialFormat?: 'csv' | 'json';
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  notices,
  initialFormat = 'csv'
}) => {
  if (!isOpen) return null;

  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>(initialFormat);
  const [includeAI, setIncludeAI] = useState(true);

  const handleDownload = () => {
    if (exportFormat === 'csv') {
      const headers = ['ID', 'Reference', 'Regulator', 'Jurisdiction', 'Type', 'Impact Score', 'Published', 'Date in Source', 'Sector', 'Title', 'Source URL'];
      const rows = notices.map(n => [
        `"${n.id}"`,
        `"${n.ref}"`,
        `"${n.regulator}"`,
        `"${n.jurisdiction}"`,
        `"${n.type}"`,
        n.impactScore,
        `"${n.publishedAt || ''}"`,
        `"${n.deadlineDate || ''}"`,
        `"${n.sector}"`,
        `"${n.title.replace(/"/g, '""')}"`,
        `"${n.dossierUrl || ''}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RegSonar_Statutory_Export_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } else {
      const exportData = notices.map(n => ({
        id: n.id,
        ref: n.ref,
        title: n.title,
        regulator: n.regulator,
        jurisdiction: n.jurisdiction,
        type: n.type,
        impactScore: n.impactScore,
        publishedAt: n.publishedAt,
        deadlineDate: n.deadlineDate,
        sourceUrl: n.dossierUrl,
        sector: n.sector,
        tags: n.tags,
        ...(includeAI && n.keyPoints ? { keyPoints: n.keyPoints } : {}),
        summary: n.summary
      }));

      const jsonContent = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `RegSonar_Statutory_Export_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-[#FBFCFA] border border-[#C5D2CA] rounded-xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 bg-[#E3EBE6] border-b border-[#D3DDD7] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#1F4E79] text-2xl">download</span>
            <div>
              <h2 className="font-['Hanken_Grotesk'] text-[17px] text-[#1D2630] font-bold">
                Export Statutory Compliance Data
              </h2>
              <span className="font-['JetBrains_Mono'] text-[11px] text-[#56636B]">
                {notices.length} Regulatory Notices in Current Filter
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[#56636B] hover:text-[#1D2630] hover:bg-[#DCE4DF] transition-colors"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 font-['Inter'] space-y-4 text-[13px] bg-[#EEF3EF]">
          <div>
            <label className="font-['JetBrains_Mono'] text-[11px] text-[#56636B] block mb-2 font-medium">
              Select Output Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setExportFormat('csv')}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${
                  exportFormat === 'csv'
                    ? 'bg-[#D9E5EE] border-[#1F4E79] text-[#1F4E79] shadow-xs'
                    : 'bg-[#FBFCFA] border-[#D3DDD7] text-[#3C4852] hover:bg-[#F4F7F4]'
                }`}
              >
                <span className="material-symbols-outlined text-2xl text-[#1F4E79]">table_view</span>
                <span className="font-bold text-[13px]">Excel / CSV</span>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B]">Standard tabular format</span>
              </button>

              <button
                type="button"
                onClick={() => setExportFormat('json')}
                className={`p-3 rounded-lg border flex flex-col items-center gap-1.5 transition-all ${
                  exportFormat === 'json'
                    ? 'bg-[#D9E5EE] border-[#1F4E79] text-[#1F4E79] shadow-xs'
                    : 'bg-[#FBFCFA] border-[#D3DDD7] text-[#3C4852] hover:bg-[#F4F7F4]'
                }`}
              >
                <span className="material-symbols-outlined text-2xl text-[#1F4E79]">code</span>
                <span className="font-bold text-[13px]">JSON Feed</span>
                <span className="font-['JetBrains_Mono'] text-[10px] text-[#56636B]">Structured API payload</span>
              </button>
            </div>
          </div>

          <div className="p-3 bg-[#FBFCFA] border border-[#D3DDD7] rounded-lg space-y-2 shadow-2xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={includeAI}
                onChange={(e) => setIncludeAI(e.target.checked)}
                className="w-4 h-4 rounded text-[#1F4E79] bg-white border-[#C5D2CA] accent-[#1F4E79]"
              />
              <span className="text-[#1D2630] text-[12px] font-medium">
                Include key points quoted from source documents
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#E3EBE6] border-t border-[#D3DDD7] flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-[#3C4852] hover:text-[#1D2630] text-[12px] font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-1.5 bg-[#1F4E79] text-white text-[12px] font-semibold rounded hover:bg-[#163A5C] flex items-center gap-1.5 transition-colors shadow-xs"
          >
            <span className="material-symbols-outlined text-base">download</span>
            <span>Download {exportFormat.toUpperCase()}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

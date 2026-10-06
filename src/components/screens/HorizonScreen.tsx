import React, { useState } from 'react';
import { RegulatoryNotice } from '../../types/regulatory';
import { daysUntil, formatDate } from '../../lib/derived';

interface HorizonScreenProps {
  notices: RegulatoryNotice[];
  onSelectNotice: (id: string) => void;
}

interface HorizonEvent {
  notice: RegulatoryNotice;
  date: string;
  quarter: string;
  days: number;
  // Sentence from the source that names this date, when there is one
  quote?: string;
}

function quarterOf(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  return `Q${Math.ceil(m / 3)} ${y}`;
}

// Upcoming dates taken from live notices: Federal Register comment and
// effective dates, and dated sentences quoted from source documents.
export const HorizonScreen: React.FC<HorizonScreenProps> = ({ notices, onSelectNotice }) => {
  const [filterQuarter, setFilterQuarter] = useState<string>('all');

  const events: HorizonEvent[] = notices
    .filter(n => n.deadlineDate && daysUntil(n.deadlineDate) >= 0)
    .map(n => ({
      notice: n,
      date: n.deadlineDate!,
      quarter: quarterOf(n.deadlineDate!),
      days: daysUntil(n.deadlineDate!),
      quote: n.keyPoints?.facts.find(f => f.date === n.deadlineDate)?.text
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const quarters = [...new Set(events.map(e => e.quarter))];
  const visible = filterQuarter === 'all' ? events : events.filter(e => e.quarter === filterQuarter);

  return (
    <div className="w-full px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-[#0D5C63] text-2xl">timeline</span>
            <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-[#1E1B18]">
              Regulatory Horizon
            </h1>
          </div>
          <p className="font-['Inter'] text-[13px] text-[#57534E]">
            Upcoming dates found in live notices: comment deadlines, effective dates and dated statements quoted from source documents.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {['all', ...quarters].map(q => (
            <button
              key={q}
              onClick={() => setFilterQuarter(q)}
              className={`px-3 py-1 rounded text-[11px] font-['JetBrains_Mono'] font-bold border transition-colors ${
                filterQuarter === q
                  ? 'bg-[#0D5C63] text-white border-[#0D5C63]'
                  : 'bg-[#FFFFFF] text-[#57534E] border-[#E5DFD5] hover:bg-[#F5F1E8]'
              }`}
            >
              {q === 'all' ? 'All' : q}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl p-8 text-center text-[13px] text-[#57534E] shadow-xs">
          No upcoming dates found in the current notices.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(e => (
            <div
              key={e.notice.id}
              className="p-4 bg-[#FFFFFF] border border-[#E5DFD5] rounded-xl shadow-xs flex flex-col md:flex-row md:items-start gap-4"
            >
              <div className="md:w-40 shrink-0">
                <span className="font-['Hanken_Grotesk'] text-[18px] font-bold text-[#1E1B18] block">{formatDate(e.date)}</span>
                <span className={`font-['JetBrains_Mono'] text-[11px] font-bold ${e.days <= 14 ? 'text-[#DC2626]' : e.days <= 60 ? 'text-[#B45309]' : 'text-[#0D5C63]'}`}>
                  {e.days === 0 ? 'Today' : `in ${e.days} days`} • {e.quarter}
                </span>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#F5F1E8] border border-[#E5DFD5] text-[#0D5C63] font-['JetBrains_Mono'] text-[10px] font-bold">
                    {e.notice.regulator}
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-[#857F74]">{e.notice.statutoryDeadline}</span>
                </div>
                <button
                  onClick={() => onSelectNotice(e.notice.id)}
                  className="font-['Hanken_Grotesk'] text-[15px] font-bold text-[#1E1B18] hover:text-[#0D5C63] text-left"
                >
                  {e.notice.title}
                </button>
                {e.quote && (
                  <p className="font-['Inter'] text-[12px] text-[#57534E] italic border-l-2 border-[#FDE68A] pl-2.5">
                    “{e.quote}”
                  </p>
                )}
              </div>
              {e.notice.dossierUrl && (
                <a
                  href={e.notice.dossierUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-['JetBrains_Mono'] text-[11px] font-bold text-[#0D5C63] hover:underline"
                >
                  Source ↗
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

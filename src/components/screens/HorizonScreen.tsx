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
      quote: n.deadlineQuote ?? n.keyPoints?.facts.find(f => f.date === n.deadlineDate)?.text
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const quarters = [...new Set(events.map(e => e.quarter))];
  const visible = filterQuarter === 'all' ? events : events.filter(e => e.quarter === filterQuarter);

  return (
    <div className="w-full px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-panel border border-line rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-accent text-2xl" aria-hidden="true">timeline</span>
            <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-ink">
              Regulatory Horizon
            </h1>
          </div>
          <p className="font-['Inter'] text-[13px] text-ink-soft">
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
                  ? 'bg-accent text-on-accent border-accent'
                  : 'bg-panel text-ink-soft border-line hover:bg-wash'
              }`}
            >
              {q === 'all' ? 'All' : q}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-panel border border-line rounded-xl p-8 text-center text-[13px] text-ink-soft shadow-xs">
          No upcoming dates found in the current notices.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(e => (
            <div
              key={e.notice.id}
              className="p-4 bg-panel border border-line rounded-xl shadow-xs flex flex-col md:flex-row md:items-start gap-4"
            >
              <div className="md:w-40 shrink-0">
                <span className="font-['Hanken_Grotesk'] text-[18px] font-bold text-ink block">{formatDate(e.date)}</span>
                <span className={`font-['JetBrains_Mono'] text-[11px] font-bold ${e.days <= 14 ? 'text-orange' : e.days <= 60 ? 'text-cream' : 'text-accent'}`}>
                  {e.days === 0 ? 'Today' : `in ${e.days} days`} • {e.quarter}
                </span>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-wash border border-line text-accent font-['JetBrains_Mono'] text-[10px] font-bold">
                    {e.notice.regulator}
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-muted">{e.notice.statutoryDeadline}</span>
                </div>
                <button
                  onClick={() => onSelectNotice(e.notice.id)}
                  className="font-['Hanken_Grotesk'] text-[15px] font-bold text-ink hover:text-accent text-left"
                >
                  {e.notice.title}
                </button>
                {e.quote && (
                  <p className="font-['Inter'] text-[12px] text-ink-soft italic border-l-2 border-cream-line pl-2.5">
                    “{e.quote}”
                  </p>
                )}
              </div>
              {e.notice.dossierUrl && (
                <a
                  href={e.notice.dossierUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 font-['JetBrains_Mono'] text-[11px] font-bold text-accent hover:underline"
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

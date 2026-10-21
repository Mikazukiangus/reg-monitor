import React, { useState } from 'react';
import { RegulatoryNotice } from '../../../shared/regulatory';
import { formatDate } from '../../../shared/derived';
import { byMonth, dateParts, horizonEvents } from '../../lib/horizon';

interface HorizonScreenProps {
  notices: RegulatoryNotice[];
  onSelectNotice: (id: string) => void;
}

const relative = (days: number) => (days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`);

// Upcoming dates taken from live notices: Federal Register comment and
// effective dates, and dated sentences quoted from source documents.
export const HorizonScreen: React.FC<HorizonScreenProps> = ({ notices, onSelectNotice }) => {
  const [filterQuarter, setFilterQuarter] = useState<string>('all');

  const events = horizonEvents(notices);
  const quarters = [...new Set(events.map(e => e.quarter))];
  const visible = filterQuarter === 'all' ? events : events.filter(e => e.quarter === filterQuarter);
  // Phones group the dates by month, like a calendar's schedule view
  const months = byMonth(visible);

  return (
    <div className="w-full px-4 sm:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
      <div className="bg-panel border border-line rounded-xl p-4 md:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-accent text-2xl" aria-hidden="true">timeline</span>
            <h1 className="font-['Hanken_Grotesk'] text-[20px] md:text-[22px] font-bold text-ink">
              Regulatory Horizon
            </h1>
          </div>
          <p className="font-['Inter'] text-[12px] md:text-[13px] text-ink-soft">
            Upcoming dates found in live notices: comment deadlines, effective dates and dated statements quoted from source documents.
          </p>
        </div>

        {/* One row that scrolls sideways on phones */}
        <div role="group" aria-label="Quarter" className="flex md:flex-wrap items-center gap-1.5 max-md:overflow-x-auto scrollbar-none">
          {['all', ...quarters].map(q => {
            const count = q === 'all' ? events.length : events.filter(e => e.quarter === q).length;
            return (
              <button
                key={q}
                onClick={() => setFilterQuarter(q)}
                aria-pressed={filterQuarter === q}
                aria-label={`${q === 'all' ? 'All' : q}, ${count} ${count === 1 ? 'date' : 'dates'}`}
                className={`shrink-0 px-3 py-1 max-md:min-h-10 rounded text-[11px] font-['JetBrains_Mono'] font-bold border transition-colors ${
                  filterQuarter === q
                    ? 'bg-accent text-on-accent border-accent'
                    : 'bg-panel text-ink-soft border-line hover:bg-wash'
                }`}
              >
                {q === 'all' ? 'All' : q}
                <span className="ml-1.5 font-normal opacity-75">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="bg-panel border border-line rounded-xl p-8 text-center text-[13px] text-ink-soft shadow-xs">
          No upcoming dates found in the current notices.
        </div>
      ) : (
        <div className="space-y-4 md:space-y-3">
          {months.map(group => (
            <section key={group.month} aria-label={group.month} className="space-y-2 md:space-y-3">
              {/* Stays below the fixed header while its month scrolls past */}
              <h2 className="md:hidden sticky top-14 z-10 -mx-4 px-4 py-2 bg-page/95 backdrop-blur-sm flex items-baseline justify-between font-['Hanken_Grotesk'] text-[15px] font-bold text-ink">
                {group.month}
                <span className="font-['JetBrains_Mono'] text-[11px] font-medium text-muted">
                  <span className="sr-only">, </span>{group.events.length} {group.events.length === 1 ? 'date' : 'dates'}
                </span>
              </h2>
              {group.events.map(e => {
                const parts = dateParts(e.date);
                const tone = e.days <= 14 ? 'text-orange' : e.days <= 60 ? 'text-cream' : 'text-accent';
                return (
                  <div
                    key={e.notice.id}
                    className="p-3 md:p-4 bg-panel border border-line rounded-xl shadow-xs flex md:items-start gap-3 md:gap-4"
                  >
                    {/* Phones: a calendar-style date block */}
                    <div className="md:hidden w-12 shrink-0 text-center">
                      <span className="font-['Hanken_Grotesk'] text-[22px] font-bold text-ink block leading-none">{parts.day}</span>
                      <span className="font-['JetBrains_Mono'] text-[10px] uppercase text-muted block mt-1">{parts.weekday}</span>
                      <span className={`font-['JetBrains_Mono'] text-[10px] font-bold block mt-0.5 ${tone}`}>{relative(e.days)}</span>
                    </div>
                    <div className="max-md:hidden md:w-40 shrink-0">
                      <span className="font-['Hanken_Grotesk'] text-[18px] font-bold text-ink block">{formatDate(e.date)}</span>
                      <span className={`font-['JetBrains_Mono'] text-[11px] font-bold ${tone}`}>
                        {e.days === 0 ? 'Today' : `in ${e.days} days`} • {e.quarter}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0 space-y-1 md:space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-wash border border-line text-accent font-['JetBrains_Mono'] text-[10px] font-bold">
                          {e.notice.regulator}
                        </span>
                        {/* The date itself is in the block on phones, so only its kind is repeated */}
                        <span className="md:hidden font-['JetBrains_Mono'] text-[11px] text-muted">{e.label}</span>
                        <span className="max-md:hidden font-['JetBrains_Mono'] text-[11px] text-muted">{e.text}</span>
                        {e.notice.dossierUrl && (
                          <a
                            href={e.notice.dossierUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="md:hidden ml-auto inline-flex items-center min-h-8 px-1 font-['JetBrains_Mono'] text-[11px] font-bold text-accent"
                          >
                            Source ↗
                          </a>
                        )}
                      </div>
                      <button
                        onClick={() => onSelectNotice(e.notice.id)}
                        className="font-['Hanken_Grotesk'] text-[14px] md:text-[15px] font-bold text-ink hover:text-accent text-left max-md:line-clamp-3"
                      >
                        {e.notice.title}
                      </button>
                      {e.quote && (
                        <p className="font-['Inter'] text-[12px] text-ink-soft italic border-l-2 border-cream-line pl-2.5 max-md:line-clamp-2">
                          “{e.quote}”
                        </p>
                      )}
                    </div>
                    {e.notice.dossierUrl && (
                      <a
                        href={e.notice.dossierUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="max-md:hidden shrink-0 font-['JetBrains_Mono'] text-[11px] font-bold text-accent hover:underline"
                      >
                        Source ↗
                      </a>
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

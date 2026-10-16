import React, { useState } from 'react';
import { RegulatoryNotice } from '../../types/regulatory';
import { sortNewestFirst } from '../../lib/derived';

interface EnforcementScreenProps {
  notices: RegulatoryNotice[];
  onSelectNotice: (id: string) => void;
}

// Enforcement-related publications from live sources. Penalty amounts and
// party names are only shown where the source text states them.
export const EnforcementScreen: React.FC<EnforcementScreenProps> = ({ notices, onSelectNotice }) => {
  const records = sortNewestFirst(notices.filter(n => n.format === 'Enforcement'));
  // Phones: one regulator at a time, and each record's first key point until "Show more"
  const [regulator, setRegulator] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const regulators = [...new Set(records.map(n => n.regulator))]
    .map(name => ({ name, count: records.filter(n => n.regulator === name).length }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const shown = regulator && regulators.some(r => r.name === regulator) ? regulator : null;
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (!next.delete(id)) next.add(id);
    return next;
  });
  const chip = (active: boolean) =>
    `snap-start shrink-0 min-h-10 px-3 rounded-full border font-['Inter'] text-[12px] font-semibold flex items-center gap-1.5 transition-colors ${
      active ? 'bg-accent text-on-accent border-accent' : 'bg-panel text-ink-soft border-line'
    }`;

  return (
    <div className="w-full px-4 sm:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
      <div className="bg-panel border border-line rounded-xl p-4 md:p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-accent text-2xl" aria-hidden="true">gavel</span>
          <h1 className="font-['Hanken_Grotesk'] text-[20px] md:text-[22px] font-bold text-ink">
            Enforcement &amp; Sanctions
          </h1>
        </div>
        <p className="font-['Inter'] text-[12px] md:text-[13px] text-ink-soft">
          Enforcement publications from live sources, such as MAS enforcement action releases. Open the source for parties, findings and penalties.
        </p>
      </div>

      {records.length > 0 && (
        <div role="group" aria-label="Regulator" className="md:hidden -mx-4 px-4 scroll-px-4 flex gap-2 overflow-x-auto scrollbar-none snap-x">
          <button onClick={() => setRegulator(null)} aria-pressed={!shown} aria-label={`All regulators, ${records.length} records`} className={chip(!shown)}>
            All
            <span className={`font-['JetBrains_Mono'] text-[11px] ${shown ? 'text-muted' : ''}`}>{records.length}</span>
          </button>
          {regulators.map(r => (
            <button
              key={r.name}
              onClick={() => setRegulator(r.name)}
              aria-pressed={shown === r.name}
              aria-label={`${r.name}, ${r.count} ${r.count === 1 ? 'record' : 'records'}`}
              className={chip(shown === r.name)}
            >
              {r.name}
              <span className={`font-['JetBrains_Mono'] text-[11px] ${shown === r.name ? '' : 'text-muted'}`}>{r.count}</span>
            </button>
          ))}
        </div>
      )}

      {records.length === 0 ? (
        <div className="bg-panel border border-line rounded-xl p-8 text-center text-[13px] text-ink-soft shadow-xs">
          No enforcement publications in the current live notices.
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(n => {
            const open = expanded.has(n.id);
            const more = open ? '' : 'max-md:hidden';
            const points = n.keyPoints?.points ?? [];
            return (
              <article
                key={n.id}
                className={`p-3.5 md:p-5 bg-panel border border-line rounded-xl shadow-xs space-y-2 ${shown && n.regulator !== shown ? 'max-md:hidden' : ''}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded bg-orange-wash border border-orange-line text-orange font-['JetBrains_Mono'] text-[10px] font-bold">
                      {n.regulator}
                    </span>
                    <span className={`font-['JetBrains_Mono'] text-[11px] text-muted break-all ${more}`}>{n.ref}</span>
                  </div>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-ink-soft">
                    <span className="max-md:hidden">Published </span>{n.issuedTimeAgo}
                  </span>
                </div>
                <button
                  onClick={() => onSelectNotice(n.id)}
                  className="font-['Hanken_Grotesk'] text-[15px] md:text-[16px] font-bold text-ink hover:text-accent text-left max-md:line-clamp-3"
                >
                  {n.title}
                </button>
                {points.length > 0 ? (
                  <ul className="space-y-1 font-['Inter'] text-[12px] text-ink-soft">
                    {points.map((p, i) => (
                      <li key={i} className={`border-l-2 border-line pl-2.5 italic ${i > 0 ? more : open ? '' : 'max-md:line-clamp-3'}`}>{p}</li>
                    ))}
                  </ul>
                ) : n.summary ? (
                  <p className={`font-['Inter'] text-[12px] text-ink-soft ${open ? '' : 'max-md:line-clamp-3'}`}>{n.summary}</p>
                ) : null}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {n.dossierUrl && (
                    <a
                      href={n.dossierUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center max-md:min-h-10 font-['JetBrains_Mono'] text-[11px] font-bold text-accent hover:underline"
                    >
                      Read the full release ↗
                    </a>
                  )}
                  {(points.length > 1 || n.ref) && (
                    <button
                      onClick={() => toggle(n.id)}
                      aria-expanded={open}
                      className="md:hidden ml-auto min-h-10 flex items-center gap-1 font-['Inter'] text-[12px] font-semibold text-accent"
                    >
                      <span className="material-symbols-outlined text-lg" aria-hidden="true">{open ? 'expand_less' : 'expand_more'}</span>
                      {open ? 'Show less' : points.length > 1 ? `${points.length - 1} more key point${points.length === 2 ? '' : 's'}` : 'Show more'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
};

import React from 'react';
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

  return (
    <div className="w-full px-4 sm:px-6 py-6 space-y-6">
      <div className="bg-panel border border-line rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-prussian text-2xl" aria-hidden="true">gavel</span>
          <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-ink">
            Enforcement &amp; Sanctions
          </h1>
        </div>
        <p className="font-['Inter'] text-[13px] text-ink-soft">
          Enforcement publications from live sources, such as MAS enforcement action releases. Open the source for parties, findings and penalties.
        </p>
      </div>

      {records.length === 0 ? (
        <div className="bg-panel border border-line rounded-xl p-8 text-center text-[13px] text-ink-soft shadow-xs">
          No enforcement publications in the current live notices.
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(n => (
            <article key={n.id} className="p-5 bg-panel border border-line rounded-xl shadow-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-venetian-wash border border-venetian-line text-venetian font-['JetBrains_Mono'] text-[10px] font-bold">
                    {n.regulator}
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-muted">{n.ref}</span>
                </div>
                <span className="font-['JetBrains_Mono'] text-[11px] text-ink-soft">Published {n.issuedTimeAgo}</span>
              </div>
              <button
                onClick={() => onSelectNotice(n.id)}
                className="font-['Hanken_Grotesk'] text-[16px] font-bold text-ink hover:text-prussian text-left"
              >
                {n.title}
              </button>
              {n.keyPoints && n.keyPoints.points.length > 0 ? (
                <ul className="space-y-1 font-['Inter'] text-[12px] text-ink-soft">
                  {n.keyPoints.points.map((p, i) => (
                    <li key={i} className="border-l-2 border-line pl-2.5 italic">{p}</li>
                  ))}
                </ul>
              ) : n.summary ? (
                <p className="font-['Inter'] text-[12px] text-ink-soft">{n.summary}</p>
              ) : null}
              {n.dossierUrl && (
                <a
                  href={n.dossierUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block font-['JetBrains_Mono'] text-[11px] font-bold text-prussian hover:underline"
                >
                  Read the full release ↗
                </a>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

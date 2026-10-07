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
      <div className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-xl p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-[#1F4E79] text-2xl">gavel</span>
          <h1 className="font-['Hanken_Grotesk'] text-[22px] font-bold text-[#1D2630]">
            Enforcement &amp; Sanctions
          </h1>
        </div>
        <p className="font-['Inter'] text-[13px] text-[#3C4852]">
          Enforcement publications from live sources, such as MAS enforcement action releases. Open the source for parties, findings and penalties.
        </p>
      </div>

      {records.length === 0 ? (
        <div className="bg-[#FBFCFA] border border-[#D3DDD7] rounded-xl p-8 text-center text-[13px] text-[#3C4852] shadow-xs">
          No enforcement publications in the current live notices.
        </div>
      ) : (
        <div className="space-y-3">
          {records.map(n => (
            <article key={n.id} className="p-5 bg-[#FBFCFA] border border-[#D3DDD7] rounded-xl shadow-xs space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-[#F8E8E2] border border-[#E2B5A6] text-[#A8432F] font-['JetBrains_Mono'] text-[10px] font-bold">
                    {n.regulator}
                  </span>
                  <span className="font-['JetBrains_Mono'] text-[11px] text-[#56636B]">{n.ref}</span>
                </div>
                <span className="font-['JetBrains_Mono'] text-[11px] text-[#3C4852]">Published {n.issuedTimeAgo}</span>
              </div>
              <button
                onClick={() => onSelectNotice(n.id)}
                className="font-['Hanken_Grotesk'] text-[16px] font-bold text-[#1D2630] hover:text-[#1F4E79] text-left"
              >
                {n.title}
              </button>
              {n.keyPoints && n.keyPoints.points.length > 0 ? (
                <ul className="space-y-1 font-['Inter'] text-[12px] text-[#3C4852]">
                  {n.keyPoints.points.map((p, i) => (
                    <li key={i} className="border-l-2 border-[#D3DDD7] pl-2.5 italic">{p}</li>
                  ))}
                </ul>
              ) : n.summary ? (
                <p className="font-['Inter'] text-[12px] text-[#3C4852]">{n.summary}</p>
              ) : null}
              {n.dossierUrl && (
                <a
                  href={n.dossierUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block font-['JetBrains_Mono'] text-[11px] font-bold text-[#1F4E79] hover:underline"
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

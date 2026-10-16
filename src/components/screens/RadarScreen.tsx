import React, { useState } from 'react';
import { JurisdictionCode, RegulatoryNotice, SectorDomain } from '../../types/regulatory';
import { SECTORS } from '../../lib/tagging';
import { sortNewestFirst } from '../../lib/derived';


const JURISDICTIONS: { code: JurisdictionCode; name: string; sources: string }[] = [
  { code: 'SG', name: 'Singapore', sources: 'MAS, SGX RegCo; PDPC privacy' },
  { code: 'MY', name: 'Malaysia', sources: 'BNM, SC; JPDP privacy' },
  { code: 'HK', name: 'Hong Kong', sources: 'HKMA, SFC, HKEX' },
  { code: 'US', name: 'United States', sources: 'SEC/CFTC, FINRA; AI rules, privacy' },
  { code: 'UK_EU', name: 'UK & EU', sources: 'PRA, FCA, ESMA; AI rules; ICO, EDPB privacy' },
  { code: 'AU', name: 'Australia', sources: 'ASIC, ASX; OAIC privacy' },
  { code: 'JP', name: 'Japan', sources: 'JFSA, JPX; AI strategy; PPC privacy' },
  { code: 'KR', name: 'South Korea', sources: 'MSIT AI rules; PIPC privacy' },
  { code: 'CN', name: 'China', sources: 'State Council policy library: AI rules, privacy' },
  { code: 'GLOBAL', name: 'Global', sources: 'BIS/BCBS, FSB' }
];

// Titles shown per sector on phones before "Show all"
const PHONE_TITLES = 3;

interface RadarScreenProps {
  notices: RegulatoryNotice[];
  onSelectNotice: (id: string) => void;
}

// Where live publications are landing, by sector and jurisdiction. Sector is
// assigned by keyword rules, so treat the grid as an index, not an assessment.
export const RadarScreen: React.FC<RadarScreenProps> = ({ notices, onSelectNotice }) => {
  const sorted = sortNewestFirst(notices);
  const cellOf = (sector: SectorDomain, code: JurisdictionCode) =>
    sorted.filter(n => (n.sectors ?? [n.sector]).includes(sector) && n.jurisdictionCode === code);

  // Phones show one jurisdiction at a time; until one is picked, the first with notices
  const [picked, setPicked] = useState<JurisdictionCode | null>(null);
  const [openSectors, setOpenSectors] = useState<Set<SectorDomain>>(new Set());
  const counts = new Map(JURISDICTIONS.map(j => [j.code, sorted.filter(n => n.jurisdictionCode === j.code).length]));
  const current = JURISDICTIONS.find(j => j.code === picked) ?? JURISDICTIONS.find(j => counts.get(j.code)) ?? JURISDICTIONS[0];
  const rows = SECTORS.map(sector => ({ sector, cell: cellOf(sector, current.code) }));
  const busy = rows.filter(r => r.cell.length > 0).sort((a, b) => b.cell.length - a.cell.length);
  const quiet = rows.filter(r => r.cell.length === 0).map(r => r.sector);
  const pick = (code: JurisdictionCode) => { setPicked(code); setOpenSectors(new Set()); };
  const toggleSector = (sector: SectorDomain) => setOpenSectors(prev => {
    const next = new Set(prev);
    if (!next.delete(sector)) next.add(sector);
    return next;
  });

  return (
    <div className="w-full px-4 sm:px-6 py-4 md:py-6 space-y-4 md:space-y-6">
      <div className="bg-panel border border-line rounded-xl p-4 md:p-5 shadow-xs">
        <div className="flex items-center gap-2 mb-1">
          <span className="material-symbols-outlined text-accent text-2xl" aria-hidden="true">radar</span>
          <h1 className="font-['Hanken_Grotesk'] text-[20px] md:text-[22px] font-bold text-ink">
            Regulatory Radar
          </h1>
        </div>
        <p className="font-['Inter'] text-[12px] md:text-[13px] text-ink-soft">
          Live publications by jurisdiction and sector, newest first. Sectors are assigned by keyword rules, and a notice with more than one sector appears in each of its rows.
        </p>
      </div>

      {/* Phones: pick a jurisdiction, then its sectors as a list, busiest first */}
      <div className="md:hidden space-y-3">
        <div role="group" aria-label="Jurisdiction" className="-mx-4 px-4 scroll-px-4 flex gap-2 overflow-x-auto scrollbar-none snap-x">
          {JURISDICTIONS.map(j => {
            const active = j.code === current.code;
            return (
              <button
                key={j.code}
                onClick={() => pick(j.code)}
                aria-pressed={active}
                aria-label={`${j.name}, ${counts.get(j.code)} ${counts.get(j.code) === 1 ? 'notice' : 'notices'}`}
                className={`snap-start shrink-0 min-h-10 px-3 rounded-full border font-['Inter'] text-[12px] font-semibold flex items-center gap-1.5 transition-colors ${
                  active ? 'bg-accent text-on-accent border-accent' : 'bg-panel text-ink-soft border-line'
                }`}
              >
                {j.name}
                <span className={`font-['JetBrains_Mono'] text-[11px] ${active ? '' : 'text-muted'}`}>{counts.get(j.code)}</span>
              </button>
            );
          })}
        </div>
        <p className="font-['JetBrains_Mono'] text-[11px] text-muted">{current.name}: {current.sources}</p>

        {busy.length === 0 && (
          <div className="bg-panel border border-line rounded-xl p-6 text-center text-[13px] text-ink-soft">
            No notices from {current.name} in the loaded feed.
          </div>
        )}
        {busy.map(({ sector, cell }) => {
          const open = openSectors.has(sector);
          return (
            <section key={sector} aria-label={sector} className="bg-panel border border-line rounded-xl p-3.5 shadow-xs">
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <h2 className="font-['Hanken_Grotesk'] text-[15px] font-bold text-ink leading-snug">{sector}</h2>
                <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border bg-accent-tint text-accent border-accent-line">
                  {cell.length} {cell.length === 1 ? 'notice' : 'notices'}
                </span>
              </div>
              <ul className="divide-y divide-line">
                {(open ? cell : cell.slice(0, PHONE_TITLES)).map(n => (
                  <li key={n.id}>
                    <button
                      onClick={() => onSelectNotice(n.id)}
                      className="w-full min-h-10 py-2 text-left font-['Inter'] text-[13px] text-ink-soft hover:text-accent leading-snug"
                    >
                      <span className="block font-['JetBrains_Mono'] text-[10px] text-muted mb-0.5">
                        <span className="font-bold text-accent">{n.regulator}</span> · {n.issuedTimeAgo}
                      </span>
                      <span className="line-clamp-2">{n.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {cell.length > PHONE_TITLES && (
                <button
                  onClick={() => toggleSector(sector)}
                  aria-expanded={open}
                  className="mt-1 min-h-10 flex items-center gap-1 font-['Inter'] text-[12px] font-semibold text-accent"
                >
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">{open ? 'expand_less' : 'expand_more'}</span>
                  {open ? 'Show fewer' : `Show all ${cell.length}`}
                </button>
              )}
            </section>
          );
        })}
        {busy.length > 0 && quiet.length > 0 && (
          <p className="font-['Inter'] text-[12px] text-muted">
            No notices in: {quiet.join(', ')}.
          </p>
        )}
      </div>

      <div className="max-md:hidden bg-panel border border-line rounded-xl overflow-hidden shadow-xs">
        {/* Scrolls on its own, sized to the screen below the fixed header, so the
            header row stays at the top and the sector column at the left while
            the grid scrolls */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Notices by sector and jurisdiction"
          className="overflow-auto max-h-[calc(100dvh_-_128px_-_24px)] focus-visible:-outline-offset-2"
        >
          <table className="w-full text-left text-[12px] font-['Inter'] border-separate border-spacing-0">
            <thead>
              <tr className="font-['JetBrains_Mono'] text-[11px] text-ink">
                <th scope="col" className="sticky top-0 left-0 z-30 bg-wash border-b border-r border-line p-3 pl-3 sm:p-3.5 sm:pl-5 min-w-[112px] sm:min-w-[180px] font-bold">SECTOR</th>
                {JURISDICTIONS.map(j => (
                  <th key={j.code} scope="col" className="sticky top-0 z-20 bg-wash border-b border-line p-3.5 min-w-[200px] font-bold">{`${j.name} (${j.sources})`.toUpperCase()}</th>
                ))}
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>*]:border-b-0">
              {SECTORS.map(sector => (
                <tr key={sector} className="align-top">
                  <th scope="row" className="sticky left-0 z-10 bg-panel border-b border-r border-line p-3 pl-3 sm:p-3.5 sm:pl-5 font-bold text-ink">{sector}</th>
                  {JURISDICTIONS.map(j => {
                    const cell = cellOf(sector, j.code);
                    return (
                      <td key={j.code} className="p-3.5 border-b border-line">
                        {cell.length === 0 ? (
                          <span className="text-line-dim">–</span>
                        ) : (
                          <div className="space-y-1.5">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-['JetBrains_Mono'] font-bold border bg-accent-tint text-accent border-accent-line">
                              {cell.length} {cell.length === 1 ? 'notice' : 'notices'}
                            </span>
                            {cell.slice(0, 2).map(n => (
                              <button
                                key={n.id}
                                onClick={() => onSelectNotice(n.id)}
                                className="block text-left text-ink-soft hover:text-accent leading-snug line-clamp-2"
                              >
                                {n.title}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

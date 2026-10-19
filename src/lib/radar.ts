// The Regulatory Radar grid: live notices by sector and jurisdiction, newest
// first. A notice with several sectors is in each of its rows. Pure, so it is
// tested without the page.
import type { JurisdictionCode, RegulatoryNotice, SectorDomain } from '../types/regulatory';
import { sortNewestFirst } from './derived';
import { SECTORS } from './tagging';

export const RADAR_JURISDICTIONS: { code: JurisdictionCode; name: string; sources: string }[] = [
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

export interface Radar {
  // The notices in one cell, newest first
  cell: (sector: SectorDomain, code: JurisdictionCode) => RegulatoryNotice[];
  // Notices per jurisdiction
  counts: Map<JurisdictionCode, number>;
}

export function buildRadar(notices: RegulatoryNotice[]): Radar {
  const sorted = sortNewestFirst(notices);
  return {
    cell: (sector, code) => sorted.filter(n => (n.sectors ?? [n.sector]).includes(sector) && n.jurisdictionCode === code),
    counts: new Map(RADAR_JURISDICTIONS.map(j => [j.code, sorted.filter(n => n.jurisdictionCode === j.code).length]))
  };
}

// Phones show one jurisdiction at a time; until one is picked, the first with notices
export function shownJurisdiction(radar: Radar, picked: JurisdictionCode | null) {
  return RADAR_JURISDICTIONS.find(j => j.code === picked)
    ?? RADAR_JURISDICTIONS.find(j => radar.counts.get(j.code))
    ?? RADAR_JURISDICTIONS[0];
}

// One jurisdiction's sectors: those with notices, busiest first, and the quiet ones
export function sectorsIn(radar: Radar, code: JurisdictionCode) {
  const rows = SECTORS.map(sector => ({ sector, cell: radar.cell(sector, code) }));
  return {
    busy: rows.filter(r => r.cell.length > 0).sort((a, b) => b.cell.length - a.cell.length),
    quiet: rows.filter(r => r.cell.length === 0).map(r => r.sector)
  };
}

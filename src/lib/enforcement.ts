// Enforcement publications, newest first, and how many each regulator has
import type { RegulatoryNotice } from '../../shared/regulatory';
import { sortNewestFirst } from '../../shared/derived';

export function enforcementRecords(notices: RegulatoryNotice[]): RegulatoryNotice[] {
  return sortNewestFirst(notices.filter(n => n.format === 'Enforcement'));
}

// Most records first, then by name
export function countByRegulator(records: RegulatoryNotice[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of records) counts.set(n.regulator, (counts.get(n.regulator) ?? 0) + 1);
  return [...counts].map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

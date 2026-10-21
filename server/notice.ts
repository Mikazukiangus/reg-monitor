// The notice the server builds, and its tags: sector, format, type colour
// and impact score, set the same way for every source and stored copy.
import { classifySectors, classifyFormat, RENAMED_SECTORS, SECTORS } from '../shared/tagging.js';
import { assessImpact, severityOf } from '../shared/impact.js';
import type { SectorDomain, InstrumentFormat, RegulatoryNotice } from '../shared/regulatory.js';
import { publicationTime } from '../shared/derived.js';
import { regulatorIdOf, regulatorNamed } from '../shared/regulators.js';
import { logger } from './logging.js';

// A notice as the server builds it: the browser's notice without the fields
// only the browser sets
export type NormalizedNotice = Omit<RegulatoryNotice, 'bookmarked' | 'savedCopy'>;


export const getRelativeTime = publicationTime;

// Helper to determine sector from text
// Sector and format by keyword rules (shared/tagging.ts). Sources call these
// while parsing; tagNotice then sets every sector with its reasons, using the
// summary and, once read, the key points.
export const sectorOf = (text: string): SectorDomain => classifySectors({ title: text }).sectors[0];
export const formatOf = (type: string, title: string): InstrumentFormat => classifyFormat(type, title).format;

// Older sector names, still in copies stored before they changed
const LEGACY_SECTORS = new Set(['FinTech & Digital Assets', 'Banking & Capital Markets', 'AI Governance & Ethics', 'AML/CFT & Sanctions', ...RENAMED_SECTORS.keys()]);

// Regulator names not in shared/regulators.ts, each logged once
const unlistedRegulators = new Set<string>();

// A notice's regulator id. A name that is not listed still gets the id made
// from it, and is logged once so it can be added.
function regulatorIdFor(name: string): string | undefined {
  if (!regulatorNamed(name) && !unlistedRegulators.has(name)) {
    unlistedRegulators.add(name);
    logger.warn(`[RegSonar Feed Sentinel] Regulator not listed in shared/regulators.ts: ${name}`);
  }
  return regulatorIdOf(name);
}

// Set a notice's sectors from its title, summary and key points, and record
// why. Run on every notice, including stored ones, so a rule change applies
// to the whole history.
// Format and impact score too: both come from the source's own category (the
// notice's type) and the title, the same way for every source and for notices
// read back from the history, so a rule change applies to all of them.
// And the regulator's id (shared/regulators.ts).
export function tagNotice<T extends NormalizedNotice>(notice: T): T {
  const text = [notice.summary, ...(notice.keyPoints?.points || [])].filter(Boolean).join(' ');
  const tagged = classifySectors({ title: notice.title, text, regulator: notice.regulator });
  const { format, reason: formatReason } = classifyFormat(notice.type, notice.title);
  const impact = assessImpact({ format, type: notice.type, title: notice.title, statutoryDeadline: notice.statutoryDeadline });
  return {
    ...notice,
    regulatorId: regulatorIdFor(notice.regulator),
    format,
    typeColorClass: getTypeColor(format),
    impactScore: impact.score,
    severity: impact.severity,
    sector: tagged.sectors[0],
    sectors: tagged.sectors,
    tags: [
      ...notice.tags.filter(t => !(SECTORS as string[]).includes(t) && !LEGACY_SECTORS.has(t) && !(FORMATS as string[]).includes(t)),
      format,
      ...tagged.sectors
    ],
    tagging: {
      sectors: tagged.reasons,
      ...(tagged.fallback ? { sectorFallback: tagged.fallback } : {}),
      format: formatReason,
      impact: impact.reasons
    }
  };
}

const FORMATS: InstrumentFormat[] = ['Announcements', 'Circulars', 'Consultations', 'Enforcement', 'Guidelines', 'Technical Standards'];

// Helper for type color styles
export function getTypeColor(format: string) {
  switch (format) {
    case 'Consultations':
      return { bg: 'bg-[#EDE9FE]', text: 'text-[#6D28D9]' };
    case 'Enforcement':
      return { bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]' };
    case 'Guidelines':
      return { bg: 'bg-[#DCFCE7]', text: 'text-[#15803D]' };
    case 'Technical Standards':
      return { bg: 'bg-[#F5F1E8]', text: 'text-[#57534E]' };
    default:
      return { bg: 'bg-[#E6F4F4]', text: 'text-[#0D5C63]' };
  }
}

// A first score while a source is read; tagNotice then sets the final score
// for every notice with the full rubric (shared/impact.ts)
export const estimateImpact = (format: InstrumentFormat): number => assessImpact({ format, type: '', title: '' }).score;
export const severityFor = severityOf;

// Which notices the feed shows, and in what order, for the filters chosen,
// and how many notices fall under each filter choice. Pure, so it is tested
// without the page.
import { JurisdictionCode, RegulatoryNotice, SectorDomain, UrgencySeverity } from '../../shared/regulatory';
import { publishedDay } from '../../shared/derived';
import { SECTORS } from '../../shared/tagging';
import type { ViewState } from './urlState';

export type FeedFilters = Pick<ViewState,
  'headerJurisdiction' | 'severities' | 'jurisdictions' | 'sectors' | 'format' | 'sort' | 'onlyNew' | 'onlySaved' | 'dateFrom' | 'dateTo'>;

export interface FilterContext {
  // Whether this browser had not seen the notice before this visit
  isNew: (id: string) => boolean;
  bookmarkedIds: Set<string>;
  // Notices the history search found for the current search text
  archiveMatchIds: Set<string>;
  // One pattern per search term; every one must match
  searchPatterns: RegExp[];
}

export function filterNotices(notices: RegulatoryNotice[], filters: FeedFilters, context: FilterContext): RegulatoryNotice[] {
  const { headerJurisdiction, severities, jurisdictions, sectors, format, sort, onlyNew, onlySaved, dateFrom, dateTo } = filters;
  const { isNew, bookmarkedIds, archiveMatchIds, searchPatterns } = context;
  return notices.filter(notice => {
    // Header dropdown filter
    if (headerJurisdiction === 'Singapore MAS' && notice.jurisdictionCode !== 'SG') return false;
    if (headerJurisdiction === 'Malaysia' && notice.jurisdictionCode !== 'MY') return false;
    if (headerJurisdiction === 'Hong Kong HKMA' && notice.jurisdictionCode !== 'HK') return false;
    if (headerJurisdiction === 'Australia Japan' && !['AU', 'JP'].includes(notice.jurisdictionCode)) return false;
    if (headerJurisdiction === 'Korea China' && !['KR', 'CN'].includes(notice.jurisdictionCode)) return false;
    if (headerJurisdiction === 'UK US Global' && !['UK_EU', 'US', 'GLOBAL'].includes(notice.jurisdictionCode)) return false;

    // Severity check
    if (!severities.includes(notice.severity)) {
      return false;
    }

    // Jurisdiction check
    if (!jurisdictions[notice.jurisdictionCode]) {
      return false;
    }

    // Sector check: shown if any of its sectors is selected
    if (!(notice.sectors ?? [notice.sector]).some(s => sectors[s])) {
      return false;
    }

    // Format check
    if (format && notice.format !== format) {
      return false;
    }

    // Notices from the stored history are older ones, so they never count as new
    if (onlyNew && (notice.archived || !isNew(notice.id))) {
      return false;
    }

    if (onlySaved && !bookmarkedIds.has(notice.id)) return false;
    if (dateFrom || dateTo) {
      const date = publishedDay(notice.publishedAt, notice.jurisdictionCode);
      if (!date || (dateFrom && date < dateFrom) || (dateTo && date > dateTo)) return false;
    }

    // Search: every term must appear in the title,
    // reference, regulator, tags, summary or key points. Notices the history
    // search found (which also matches word forms) are kept. Spaced scripts
    // match word prefixes; Chinese/Japanese/Korean can match without spaces.
    if (searchPatterns.length > 0 && !archiveMatchIds.has(notice.id)) {
      const text = [
        notice.title, notice.ref, notice.regulator, ...notice.tags, notice.summary,
        ...(notice.keyPoints?.points || []), ...(notice.keyPoints?.facts.map(f => f.text) || [])
      ].join(' ');
      if (!searchPatterns.every(pattern => pattern.test(text))) {
        return false;
      }
    }

    return true;
  }).sort((a, b) => {
    if (sort === 'Highest Impact Score') {
      return b.impactScore - a.impactScore;
    }
    if (sort === 'Most Recent First') {
      // Notices without a publish date sort after dated ones
      return (b.publishedAt || '').localeCompare(a.publishedAt || '');
    }
    if (sort === 'Consultation Deadline') {
      return (a.deadlineDate || '9999').localeCompare(b.deadlineDate || '9999');
    }
    return 0;
  });
}

export interface FacetCounts {
  jurisdiction: Record<JurisdictionCode, number>;
  sector: Record<SectorDomain, number>;
  severity: Record<UrgencySeverity, number>;
  format: Record<string, number>;
}

// Notices under each filter choice, counting every sector a notice has
export function countFacets(notices: RegulatoryNotice[]): FacetCounts {
  const jurisdiction: Record<JurisdictionCode, number> = { SG: 0, MY: 0, HK: 0, AU: 0, JP: 0, KR: 0, CN: 0, UK_EU: 0, US: 0, GLOBAL: 0 };
  const sector = Object.fromEntries(SECTORS.map(s => [s, 0])) as Record<SectorDomain, number>;
  const severity: Record<UrgencySeverity, number> = { critical: 0, high: 0, info: 0 };
  const format: Record<string, number> = {};
  notices.forEach(n => {
    jurisdiction[n.jurisdictionCode] += 1;
    (n.sectors ?? [n.sector]).forEach(s => {
      if (s in sector) sector[s] += 1;
    });
    severity[n.severity] += 1;
    format[n.format] = (format[n.format] || 0) + 1;
  });
  return { jurisdiction, sector, severity, format };
}

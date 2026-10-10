// The feed's view (tab, filters, search, sort and an open notice) kept in the
// page URL, so a link opens the same view. Only values that differ from the
// defaults are written, so the plain URL stays clean.
import { JurisdictionCode, SectorDomain, UrgencySeverity } from '../types/regulatory';

export type SortOption = 'Highest Impact Score' | 'Most Recent First' | 'Consultation Deadline';
export type TabId = 'feed' | 'radar' | 'horizon' | 'enforcement' | 'alert-rules';
export const HEADER_JURISDICTIONS = ['All', 'Singapore MAS', 'Malaysia', 'Hong Kong HKMA', 'Australia Japan', 'Korea China', 'UK US Global'] as const;
export type HeaderJurisdiction = typeof HEADER_JURISDICTIONS[number];

export const ALL_SEVERITIES: UrgencySeverity[] = ['critical', 'high', 'info'];
export const ALL_JURISDICTIONS: JurisdictionCode[] = ['SG', 'MY', 'HK', 'AU', 'JP', 'KR', 'CN', 'UK_EU', 'US', 'GLOBAL'];
export const SECTOR_KEYS: Record<SectorDomain, string> = {
  'Banking & Prudential': 'banking',
  'Capital Markets & Listings': 'markets',
  'Funds & Asset Management': 'funds',
  'Insurance & Pensions': 'insurance',
  'FinTech, Payments & Digital Assets': 'fintech',
  'AI, Cyber & Tech Risk': 'tech',
  'ESG & Sustainability': 'esg',
  'AML/CFT & Financial Crime': 'aml',
  'Conduct & Consumer Protection': 'conduct',
  'Monetary & Financial Stability': 'monetary',
  'General & Institutional': 'general'
};
const ALL_SECTORS = Object.keys(SECTOR_KEYS) as SectorDomain[];
const SORT_KEYS: Record<SortOption, string> = {
  'Most Recent First': 'recent',
  'Highest Impact Score': 'impact',
  'Consultation Deadline': 'deadline'
};
const TABS: TabId[] = ['feed', 'radar', 'horizon', 'enforcement', 'alert-rules'];
const FORMATS = ['Announcements', 'Circulars', 'Consultations', 'Enforcement', 'Guidelines', 'Technical Standards'];

export interface ViewState {
  tab: TabId;
  search: string;
  keyword: string;
  severities: UrgencySeverity[];
  jurisdictions: Record<JurisdictionCode, boolean>;
  sectors: Record<SectorDomain, boolean>;
  format: string | null;
  sort: SortOption;
  onlyNew: boolean;
  noticeId: string | null;
  headerJurisdiction: HeaderJurisdiction;
  dateFrom: string;
  dateTo: string;
  onlySaved: boolean;
}

export function defaultViewState(): ViewState {
  return {
    tab: 'feed',
    search: '',
    keyword: '',
    severities: [...ALL_SEVERITIES],
    jurisdictions: Object.fromEntries(ALL_JURISDICTIONS.map(c => [c, true])) as Record<JurisdictionCode, boolean>,
    sectors: Object.fromEntries(ALL_SECTORS.map(s => [s, true])) as Record<SectorDomain, boolean>,
    format: null,
    sort: 'Most Recent First',
    onlyNew: false,
    noticeId: null,
    headerJurisdiction: 'All',
    dateFrom: '',
    dateTo: '',
    onlySaved: false
  };
}

const list = (value: string | null) => (value === null ? null : value.split(',').filter(Boolean));
const validDate = (value: string | null): string => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
};

export function parseViewState(search: string): ViewState {
  const p = new URLSearchParams(search);
  const state = defaultViewState();

  const tab = p.get('tab') as TabId | null;
  if (tab && TABS.includes(tab)) state.tab = tab;
  state.search = p.get('q') ?? '';
  state.keyword = p.get('kw') ?? '';

  const sev = list(p.get('sev'));
  if (sev) state.severities = ALL_SEVERITIES.filter(s => sev.includes(s));

  const jur = list(p.get('jur'));
  if (jur) ALL_JURISDICTIONS.forEach(c => (state.jurisdictions[c] = jur.includes(c)));

  const sectors = list(p.get('sector'));
  if (sectors) ALL_SECTORS.forEach(s => (state.sectors[s] = sectors.includes(SECTOR_KEYS[s])));

  const fmt = p.get('fmt');
  if (fmt && FORMATS.includes(fmt)) state.format = fmt;

  const sort = (Object.keys(SORT_KEYS) as SortOption[]).find(k => SORT_KEYS[k] === p.get('sort'));
  if (sort) state.sort = sort;

  state.onlyNew = p.get('new') === '1';
  state.noticeId = p.get('notice');
  const scope = p.get('scope') as HeaderJurisdiction;
  if (HEADER_JURISDICTIONS.includes(scope)) state.headerJurisdiction = scope;
  state.dateFrom = validDate(p.get('from'));
  state.dateTo = validDate(p.get('to'));
  state.onlySaved = p.get('saved') === '1';
  return state;
}

export function serializeViewState(state: ViewState): string {
  const p = new URLSearchParams();
  if (state.tab !== 'feed') p.set('tab', state.tab);
  if (state.search) p.set('q', state.search);
  if (state.keyword) p.set('kw', state.keyword);
  if (state.severities.length !== ALL_SEVERITIES.length) p.set('sev', state.severities.join(','));
  const jur = ALL_JURISDICTIONS.filter(c => state.jurisdictions[c]);
  if (jur.length !== ALL_JURISDICTIONS.length) p.set('jur', jur.join(','));
  const sectors = ALL_SECTORS.filter(s => state.sectors[s]);
  if (sectors.length !== ALL_SECTORS.length) p.set('sector', sectors.map(s => SECTOR_KEYS[s]).join(','));
  if (state.format) p.set('fmt', state.format);
  if (state.sort !== 'Most Recent First') p.set('sort', SORT_KEYS[state.sort]);
  if (state.onlyNew) p.set('new', '1');
  if (state.noticeId) p.set('notice', state.noticeId);
  if (state.headerJurisdiction !== 'All') p.set('scope', state.headerJurisdiction);
  if (state.dateFrom) p.set('from', state.dateFrom);
  if (state.dateTo) p.set('to', state.dateTo);
  if (state.onlySaved) p.set('saved', '1');
  const query = p.toString();
  return query ? `?${query}` : '';
}

// A link to one notice, opened in the feed
export function noticeLink(noticeId: string): string {
  return `${window.location.origin}${window.location.pathname}?notice=${encodeURIComponent(noticeId)}`;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

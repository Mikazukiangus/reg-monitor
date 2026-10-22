// Whether a value from outside the page (a feed reply, or a notice saved in
// this browser) has the fields the screens read without checking. Sector
// names should be brought up to date first (withCurrentSectorNames).
import type { RegulatoryNotice } from '../../shared/regulatory';
import { ALL_JURISDICTIONS, SECTOR_KEYS } from './urlState';
import { withCurrentSectorNames } from '../../shared/tagging';
import { safeUrl } from '../../shared/urls';

const FORMATS = ['Announcements', 'Circulars', 'Consultations', 'Enforcement', 'Guidelines', 'Technical Standards'];
const SEVERITIES = ['critical', 'high', 'info'];
const DATE_KINDS = ['closes', 'takesEffect', 'complyBy'];
const isString = (v: unknown): v is string => typeof v === 'string';
const allStrings = (v: unknown) => Array.isArray(v) && v.every(isString);

// The first field that is missing or of the wrong kind, or null when the notice can be shown
export function noticeProblem(n: any): string | null {
  if (!n || typeof n !== 'object' || Array.isArray(n)) return 'not an object';
  for (const field of ['id', 'title', 'regulator', 'ref', 'jurisdiction', 'type', 'issuedTimeAgo'] as const) {
    if (!isString(n[field])) return `${field} is not text`;
  }
  if (!ALL_JURISDICTIONS.includes(n.jurisdictionCode)) return `unknown jurisdictionCode ${JSON.stringify(n.jurisdictionCode)}`;
  if (!allStrings(n.tags)) return 'tags is not a list of text';
  if (!(n.sector in SECTOR_KEYS)) return `unknown sector ${JSON.stringify(n.sector)}`;
  if (n.sectors && !(Array.isArray(n.sectors) && n.sectors.every((s: string) => s in SECTOR_KEYS))) return 'sectors has an unknown sector';
  if (!FORMATS.includes(n.format)) return `unknown format ${JSON.stringify(n.format)}`;
  if (!Number.isFinite(n.impactScore)) return 'impactScore is not a number';
  if (!isString(n.typeColorClass?.bg) || !isString(n.typeColorClass?.text)) return 'typeColorClass is incomplete';
  const kp = n.keyPoints;
  if (kp && !(allStrings(kp.points) && Array.isArray(kp.facts) && kp.facts.every((f: any) => f && isString(f.text)) && Array.isArray(kp.refs))) {
    return 'keyPoints is incomplete';
  }
  if (!SEVERITIES.includes(n.severity)) return `unknown severity ${JSON.stringify(n.severity)}`;
  if (n.sourceDates !== undefined && !(Array.isArray(n.sourceDates) && n.sourceDates.every((d: any) => DATE_KINDS.includes(d?.kind) && /^\d{4}-\d{2}-\d{2}$/.test(d?.date)))) {
    return 'sourceDates is malformed';
  }
  return null;
}

export const isNotice = (n: unknown): n is RegulatoryNotice => noticeProblem(n) === null;

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const withLink = <T extends Record<string, any>>(value: T, field: string): T => {
  if (value[field] === undefined) return value;
  const { [field]: raw, ...rest } = value;
  const url = safeUrl(raw);
  return (url ? { ...rest, [field]: url } : rest) as T;
};

// The notice with only HTTPS web links (shared/urls.ts), as the server sends
// them; a copy saved in this browser before that, or a reply that is not,
// keeps the notice and loses the link
export function withSafeLinks<T>(n: T): T {
  if (!isObject(n)) return n;
  let safe: Record<string, any> = withLink(n, 'dossierUrl');
  if (isObject(safe.keyPoints)) safe = { ...safe, keyPoints: withLink(safe.keyPoints, 'sourceUrl') };
  if (Array.isArray(safe.related)) safe = { ...safe, related: safe.related.map(r => (isObject(r) ? withLink(r, 'dossierUrl') : r)) };
  return safe as T;
}

// Notices from outside the page that can be shown, with sector names brought
// up to date and only safe links
export const shownNotices = (list: unknown[]): RegulatoryNotice[] =>
  list.map(n => withSafeLinks(withCurrentSectorNames(n))).filter(isNotice);

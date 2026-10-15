import type { RegulatoryNotice } from '../types/regulatory';
import { ALL_JURISDICTIONS, SECTOR_KEYS } from './urlState';
import { withCurrentSectorNames } from './tagging';

export interface SavedView { id: string; name: string; query: string }
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
const BOOKMARKS_KEY = 'regsonar.bookmarks';
const VIEWS_KEY = 'regsonar.savedViews';

function read(key: string, storage?: StorageLike): unknown[] {
  try {
    const value = JSON.parse((storage ?? localStorage).getItem(key) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}
function write(key: string, value: unknown[], storage?: StorageLike): boolean {
  try { (storage ?? localStorage).setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}
export function readBookmarks(storage?: StorageLike): RegulatoryNotice[] {
  return read(BOOKMARKS_KEY, storage).map(withCurrentSectorNames).filter((n: any): n is RegulatoryNotice =>
    n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.regulator === 'string' &&
    ALL_JURISDICTIONS.includes(n.jurisdictionCode) && Array.isArray(n.tags) && n.tags.every((t: unknown) => typeof t === 'string') &&
    n.sector in SECTOR_KEYS && (!n.sectors || (Array.isArray(n.sectors) && n.sectors.every((t: string) => t in SECTOR_KEYS))) &&
    ['Announcements', 'Circulars', 'Consultations', 'Enforcement', 'Guidelines', 'Technical Standards'].includes(n.format) &&
    typeof n.ref === 'string' && typeof n.jurisdiction === 'string' && typeof n.type === 'string' &&
    Number.isFinite(n.impactScore) && typeof n.issuedTimeAgo === 'string' &&
    typeof n.typeColorClass?.bg === 'string' && typeof n.typeColorClass?.text === 'string' &&
    (!n.keyPoints || (Array.isArray(n.keyPoints.points) && n.keyPoints.points.every((p: unknown) => typeof p === 'string') &&
      Array.isArray(n.keyPoints.facts) && n.keyPoints.facts.every((f: any) => f && typeof f.text === 'string') && Array.isArray(n.keyPoints.refs))) &&
    ['critical', 'high', 'info'].includes(n.severity)).slice(0, 200);
}
export const writeBookmarks = (notices: RegulatoryNotice[], storage?: StorageLike) => write(BOOKMARKS_KEY, notices, storage);
export function readSavedViews(storage?: StorageLike): SavedView[] {
  return read(VIEWS_KEY, storage).filter((v: any): v is SavedView =>
    v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.query === 'string').slice(0, 30);
}
export const writeSavedViews = (views: SavedView[], storage?: StorageLike) => write(VIEWS_KEY, views, storage);

// A bounded row of page links, with gaps instead of every page in the feed.
export function paginationPages(page: number, total: number): (number | 'gap')[] {
  const pages = new Set([1, total, page - 1, page, page + 1]);
  const sorted = [...pages].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) result.push('gap');
    result.push(n);
  });
  return result;
}

// What this browser remembers: saved notices, saved views, alert rules, the
// feed's layout and the theme. Kept in this browser only; nothing is sent to the server.
import type { CustomAlertRule, RegulatoryNotice } from '../../shared/regulatory';
import { shownNotices } from './noticeShape';
import { DEFAULT_RULES } from '../../shared/alertRules';

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
  return shownNotices(read(BOOKMARKS_KEY, storage)).slice(0, 200);
}
export const writeBookmarks = (notices: RegulatoryNotice[], storage?: StorageLike) => write(BOOKMARKS_KEY, notices, storage);

// A dossier opened by an archived shared link need not be in the loaded feed.
export function toggleNoticeBookmark(
  saved: RegulatoryNotice[], id: string, loaded: RegulatoryNotice[], openDossier: RegulatoryNotice | null
): RegulatoryNotice[] {
  if (saved.some(n => n.id === id)) return saved.filter(n => n.id !== id);
  const notice = loaded.find(n => n.id === id) ?? (openDossier?.id === id ? openDossier : undefined);
  return notice ? [...saved, notice] : saved;
}

export function readSavedViews(storage?: StorageLike): SavedView[] {
  return read(VIEWS_KEY, storage).filter((v: any): v is SavedView =>
    v && typeof v.id === 'string' && typeof v.name === 'string' && typeof v.query === 'string').slice(0, 30);
}
export const writeSavedViews = (views: SavedView[], storage?: StorageLike) => write(VIEWS_KEY, views, storage);

// A saved rule with every field the matching reads; storage can be edited,
// or left by an older version
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(s => typeof s === 'string');
export const isAlertRule = (v: any): v is CustomAlertRule =>
  !!v && typeof v.id === 'string' && typeof v.name === 'string' && strings(v.jurisdictions) && strings(v.keywords) &&
  typeof v.minImpact === 'number' && Number.isFinite(v.minImpact) && typeof v.enabled === 'boolean';

// Rules made on the Alert Rules tab; the default rules until any are saved.
// Saved rules that are not well formed are left out.
const ALERT_RULES_KEY = 'regsonar.alertRules';
export function readAlertRules(storage?: StorageLike): CustomAlertRule[] {
  try {
    const saved = (storage ?? localStorage).getItem(ALERT_RULES_KEY);
    if (saved) {
      const rules = JSON.parse(saved);
      if (Array.isArray(rules)) return rules.filter(isAlertRule).slice(0, 100);
    }
  } catch {
    // Private windows and blocked storage: start from the default rules
  }
  return DEFAULT_RULES;
}
export const writeAlertRules = (rules: CustomAlertRule[], storage?: StorageLike) => write(ALERT_RULES_KEY, rules, storage);

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

// Cards or a dense list, remembered in this browser
export type FeedLayout = 'cards' | 'list';
const LAYOUT_KEY = 'regsonar.feedLayout';
export function readFeedLayout(storage?: StorageLike): FeedLayout {
  try { return (storage ?? localStorage).getItem(LAYOUT_KEY) === 'list' ? 'list' : 'cards'; }
  catch { return 'cards'; }
}
export function writeFeedLayout(layout: FeedLayout, storage?: StorageLike) {
  try { (storage ?? localStorage).setItem(LAYOUT_KEY, layout); } catch { /* the choice lasts for this visit */ }
}

// Light, dark, or follow the device ('system', kept by saving nothing). The
// script in index.html reads the same key before the page draws.
export type ThemeChoice = 'system' | 'light' | 'dark';
const THEME_KEY = 'regsonar.theme';

export function readTheme(storage?: Pick<Storage, 'getItem'>): ThemeChoice {
  try {
    const saved = (storage ?? localStorage).getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* Blocked storage: follow the device */ }
  return 'system';
}

export function writeTheme(choice: ThemeChoice, storage?: Pick<Storage, 'setItem' | 'removeItem'>): void {
  try {
    if (choice === 'system') (storage ?? localStorage).removeItem(THEME_KEY);
    else (storage ?? localStorage).setItem(THEME_KEY, choice);
  } catch { /* The choice still applies until the tab is closed */ }
}

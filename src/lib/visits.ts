// Which notices this browser has already seen, so new ones can be marked.
// Stored only in this browser; if storage is unavailable nothing is marked.
const SEEN_KEY = 'regsonar.seenNoticeIds';
const VISIT_KEY = 'regsonar.lastVisitAt';
const MAX_SEEN = 1000;

export interface PreviousVisit {
  seenIds: Set<string>;
  at: string | null;
}

// The stored list of seen ids, less anything that is not one (storage can be
// edited, or left by an older version)
function seenIds(stored: string | null): string[] {
  const ids: unknown = JSON.parse(stored || '[]');
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

// Read once at page load: notices not in this set are new to the viewer
export function readPreviousVisit(): PreviousVisit | null {
  try {
    const ids = localStorage.getItem(SEEN_KEY);
    if (!ids) return null;
    const at = localStorage.getItem(VISIT_KEY);
    return { seenIds: new Set(seenIds(ids)), at: at && !isNaN(Date.parse(at)) ? at : null };
  } catch {
    return null;
  }
}

export function recordVisit(noticeIds: string[]) {
  try {
    const previous = seenIds(localStorage.getItem(SEEN_KEY));
    const merged = [...new Set([...noticeIds, ...previous])].slice(0, MAX_SEEN);
    localStorage.setItem(SEEN_KEY, JSON.stringify(merged));
    localStorage.setItem(VISIT_KEY, new Date().toISOString());
  } catch {
    // Private windows and blocked storage: new-notice markers just stay off
  }
}

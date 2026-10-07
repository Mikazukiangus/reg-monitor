// Which notices this browser has already seen, so new ones can be marked.
// Stored only in this browser; if storage is unavailable nothing is marked.
const SEEN_KEY = 'regsonar.seenNoticeIds';
const VISIT_KEY = 'regsonar.lastVisitAt';
const MAX_SEEN = 1000;

export interface PreviousVisit {
  seenIds: Set<string>;
  at: string | null;
}

// Read once at page load: notices not in this set are new to the viewer
export function readPreviousVisit(): PreviousVisit | null {
  try {
    const ids = localStorage.getItem(SEEN_KEY);
    if (!ids) return null;
    return { seenIds: new Set(JSON.parse(ids) as string[]), at: localStorage.getItem(VISIT_KEY) };
  } catch {
    return null;
  }
}

export function recordVisit(noticeIds: string[]) {
  try {
    const previous = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]') as string[];
    const merged = [...new Set([...noticeIds, ...previous])].slice(0, MAX_SEEN);
    localStorage.setItem(SEEN_KEY, JSON.stringify(merged));
    localStorage.setItem(VISIT_KEY, new Date().toISOString());
  } catch {
    // Private windows and blocked storage: new-notice markers just stay off
  }
}

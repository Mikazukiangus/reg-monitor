// The site's own API, as the browser uses it: each request's address, and its
// reply as a typed result. Hooks decide what to show; nothing here touches
// React state or the page.
import type { CheckSummary, CustomAlertRule, EndpointMetric, RegulatoryNotice } from '../../shared/regulatory';
import { checkFeedReply } from './feedReply';
import { shownNotices } from '../lib/noticeShape';

// How long the page waits for each reply, body included, before giving up.
// The feed may read every regulator site (each limited to 8 seconds on the
// server); endpoint status checks them all; the rest are database reads.
export const WAIT_MS = { feed: 60_000, status: 30_000, read: 20_000 } as const;

// A signal that aborts after ms, or earlier when the caller's own signal does.
// A timeout rejects with a DOMException named "TimeoutError". Browsers without
// AbortSignal.timeout or AbortSignal.any keep the caller's signal alone.
export function within(ms: number, signal?: AbortSignal): AbortSignal | undefined {
  if (typeof AbortSignal.timeout !== 'function') return signal;
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : signal;
}

export interface SourceSyncResult {
  endpointId: string;
  ok: boolean;
  count: number;
  lastSuccessAt?: string | null;
  error?: string;
}

export interface ArchiveStatus {
  enabled: boolean;
  count?: number;
  since?: string | null;
  error?: string;
}

export interface FeedData {
  notices?: RegulatoryNotice[];
  archive?: ArchiveStatus;
  endpoints?: EndpointMetric[];
  sources?: SourceSyncResult[];
  lastSync?: string;
}

export type SyncReply =
  // savedAt: set when the service worker answered with the copy saved on this device.
  // leftOut: a line for each notice, endpoint or source result too malformed to show.
  | { kind: 'ok'; data: FeedData; savedAt: string | null; leftOut: string[] }
  // The reply could not be read as a feed (see feedReply.ts); nothing in it is used
  | { kind: 'malformed'; problem: string }
  // The server allows each visitor a few refreshes a minute
  | { kind: 'rateLimited'; retryAfter: string | null }
  | { kind: 'failed'; status: number };

// The feed. A GET may be answered from the CDN cache; force (POST) always
// reads the sources again. Throws when the server cannot be reached or does
// not answer within WAIT_MS.feed.
export async function fetchFeed(force: boolean): Promise<SyncReply> {
  const res = await fetch('/api/feeds/sync', { method: force ? 'POST' : 'GET', signal: within(WAIT_MS.feed) });
  if (res.status === 429) return { kind: 'rateLimited', retryAfter: res.headers.get('Retry-After') };
  if (!res.ok) return { kind: 'failed', status: res.status };
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: 'malformed', problem: 'the reply is not JSON' };
  }
  const checked = checkFeedReply(body);
  if (!checked.ok) return { kind: 'malformed', problem: checked.problem };
  return { kind: 'ok', data: checked.data, savedAt: res.headers.get('X-RegSonar-Saved'), leftOut: checked.leftOut };
}

// Each endpoint's status check, without a sync result; null when the server
// gave none
export async function fetchEndpointStatus(): Promise<EndpointMetric[] | null> {
  const res = await fetch('/api/feeds/status', { signal: within(WAIT_MS.status) });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.endpoints) ? data.endpoints : null;
}

// The server searches at most this many characters
export const MAX_SEARCH_LENGTH = 200;

// Stored notices matching the search text (those that can be shown, with
// only safe links); null when the server gave none
export async function searchHistory(query: string, signal?: AbortSignal): Promise<RegulatoryNotice[] | null> {
  const res = await fetch(`/api/notices/search?q=${encodeURIComponent(query.trim().slice(0, MAX_SEARCH_LENGTH))}`, { signal: within(WAIT_MS.read, signal) });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.notices) ? shownNotices(data.notices) : null;
}

// The server looks up at most this many notices per request
const IDS_PER_REQUEST = 50;

// Notices by id, from the feed or the stored history, a batch at a time.
// Throws when a request fails, after the batches already found.
export async function* noticesByIdBatches(ids: string[], signal?: AbortSignal): AsyncGenerator<RegulatoryNotice[]> {
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    const batch = ids.slice(i, i + IDS_PER_REQUEST);
    const res = await fetch(`/api/notices/by-id?ids=${encodeURIComponent(JSON.stringify(batch))}`, { signal: within(WAIT_MS.read, signal) });
    if (!res.ok) throw new Error('Unavailable');
    const data = await res.json();
    if (Array.isArray(data.notices)) yield shownNotices(data.notices);
  }
}

export async function noticesById(ids: string[], signal?: AbortSignal): Promise<RegulatoryNotice[]> {
  const found: RegulatoryNotice[] = [];
  for await (const batch of noticesByIdBatches(ids, signal)) found.push(...batch);
  return found;
}

export interface DigestInfo {
  rules: CustomAlertRule[];
  schedule: string;
  configured: boolean;
}

// The daily email digest's rules and whether sending is set up
export async function fetchDigestInfo(signal?: AbortSignal): Promise<DigestInfo> {
  const res = await fetch('/api/digest/rules', { signal: within(WAIT_MS.read, signal) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { rules: data.rules, schedule: data.schedule, configured: data.configured };
}

export interface ScheduledChecks {
  enabled: boolean;
  latest: { startedAt: string; completedAt: string | null; status: string; summary: CheckSummary | null } | null;
  lastCompletedAt: string | null;
  dateBackfill: { pending: number; unresolved: number };
}

// The latest scheduled source check, from the history
export async function fetchScheduledChecks(signal?: AbortSignal): Promise<ScheduledChecks> {
  const res = await fetch('/api/feeds/checks', { signal: within(WAIT_MS.read, signal) });
  if (!res.ok) throw new Error('Unavailable');
  const data = await res.json();
  if (!data.success) throw new Error('Unavailable');
  return data;
}

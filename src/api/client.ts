// The site's own API, as the browser uses it: each request's address, and its
// reply as a typed result. Hooks decide what to show; nothing here touches
// React state or the page.
import type { CheckSummary, CustomAlertRule, EndpointMetric, RegulatoryNotice } from '../../shared/regulatory';

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
  // savedAt: set when the service worker answered with the copy saved on this device
  | { kind: 'ok'; data: FeedData; savedAt: string | null }
  // The server allows each visitor a few refreshes a minute
  | { kind: 'rateLimited'; retryAfter: string | null }
  | { kind: 'failed'; status: number };

// The feed. A GET may be answered from the CDN cache; force (POST) always
// reads the sources again. Throws when the server cannot be reached.
export async function fetchFeed(force: boolean): Promise<SyncReply> {
  const res = await fetch('/api/feeds/sync', { method: force ? 'POST' : 'GET' });
  if (res.status === 429) return { kind: 'rateLimited', retryAfter: res.headers.get('Retry-After') };
  if (!res.ok) return { kind: 'failed', status: res.status };
  return { kind: 'ok', data: await res.json(), savedAt: res.headers.get('X-RegSonar-Saved') };
}

// Each endpoint's status check, without a sync result; null when the server
// gave none
export async function fetchEndpointStatus(): Promise<EndpointMetric[] | null> {
  const res = await fetch('/api/feeds/status');
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.endpoints) ? data.endpoints : null;
}

// Stored notices matching the search text; null when the server gave none
export async function searchHistory(query: string, signal?: AbortSignal): Promise<RegulatoryNotice[] | null> {
  const res = await fetch(`/api/notices/search?q=${encodeURIComponent(query)}`, { signal });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.notices) ? data.notices : null;
}

// The server looks up at most this many notices per request
const IDS_PER_REQUEST = 50;

// Notices by id, from the feed or the stored history, a batch at a time.
// Throws when a request fails, after the batches already found.
export async function* noticesByIdBatches(ids: string[], signal?: AbortSignal): AsyncGenerator<RegulatoryNotice[]> {
  for (let i = 0; i < ids.length; i += IDS_PER_REQUEST) {
    const batch = ids.slice(i, i + IDS_PER_REQUEST);
    const res = await fetch(`/api/notices/by-id?ids=${encodeURIComponent(JSON.stringify(batch))}`, { signal });
    if (!res.ok) throw new Error('Unavailable');
    const data = await res.json();
    if (Array.isArray(data.notices)) yield data.notices;
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
  const res = await fetch('/api/digest/rules', { signal });
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
  const res = await fetch('/api/feeds/checks', { signal });
  if (!res.ok) throw new Error('Unavailable');
  const data = await res.json();
  if (!data.success) throw new Error('Unavailable');
  return data;
}

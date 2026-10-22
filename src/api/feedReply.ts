// Checks the feed reply (/api/feeds/sync) as it arrives, so a malformed reply
// is reported as such instead of failing later inside a screen.
//
// The reply's shape:
//   { success: true, count: number, lastSync: ISO string,
//     notices: RegulatoryNotice[]   (see shared/regulatory.ts)
//     archive: { enabled: boolean, count?: number, since?: string | null, error?: string },
//     sources: { endpointId, name, ok, count, lastSuccessAt: string | null, error? }[],
//     endpoints: EndpointMetric[] }
//
// The reply is refused when it is not an object, says success: false, has no
// notices list, or has notices of which none can be shown. Otherwise a notice,
// endpoint or source result that is malformed is left out and counted, and
// the rest is shown; a malformed archive or lastSync is ignored.
import type { EndpointMetric, RegulatoryNotice } from '../../shared/regulatory';
import { withCurrentSectorNames } from '../../shared/tagging';
import { noticeProblem, withSafeLinks } from '../lib/noticeShape';
import type { ArchiveStatus, FeedData, SourceSyncResult } from './client';

export type FeedReplyCheck =
  | { ok: true; data: FeedData; leftOut: string[] }
  | { ok: false; problem: string };

const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const ENDPOINT_STATUSES = ['Operational', 'Degraded', 'Down', 'Checking'];

function endpointProblem(e: any): string | null {
  if (!isObject(e)) return 'not an object';
  for (const field of ['id', 'name', 'agency', 'jurisdiction', 'url', 'protocol', 'auth'] as const) {
    if (typeof e[field] !== 'string') return `${field} is not text`;
  }
  if (!ENDPOINT_STATUSES.includes(e.status)) return `unknown status ${JSON.stringify(e.status)}`;
  if (e.pingMs !== null && !Number.isFinite(e.pingMs)) return 'pingMs is not a number';
  return null;
}

function sourceProblem(s: any): string | null {
  if (!isObject(s)) return 'not an object';
  if (typeof s.endpointId !== 'string') return 'endpointId is not text';
  if (typeof s.ok !== 'boolean') return 'ok is not true or false';
  if (!Number.isFinite(s.count)) return 'count is not a number';
  return null;
}

// The items that pass `problem`, and a line for each one left out
function keep<T>(items: unknown[], what: string, problem: (item: any) => string | null, leftOut: string[]): T[] {
  return items.filter((item: any, i) => {
    const p = problem(item);
    if (p) leftOut.push(`${what} ${typeof item?.id === 'string' ? item.id : typeof item?.endpointId === 'string' ? item.endpointId : `#${i}`}: ${p}`);
    return !p;
  }) as T[];
}

export function checkFeedReply(body: unknown): FeedReplyCheck {
  if (!isObject(body)) return { ok: false, problem: 'the reply is not a JSON object' };
  if (body.success === false) return { ok: false, problem: `the server reported a failure${typeof body.error === 'string' ? `: ${body.error}` : ''}` };
  if (!Array.isArray(body.notices)) return { ok: false, problem: 'the reply has no notices list' };

  const leftOut: string[] = [];
  // Sector names first, so a copy saved under old names still passes; links
  // that are not HTTPS web links are dropped
  const notices = keep<RegulatoryNotice>(body.notices.map(n => withSafeLinks(withCurrentSectorNames(n))), 'notice', noticeProblem, leftOut);
  if (body.notices.length > 0 && notices.length === 0) {
    return { ok: false, problem: `none of the ${body.notices.length} notices can be shown (${leftOut[0]})` };
  }

  const data: FeedData = { notices };
  const archive = body.archive;
  if (isObject(archive) && typeof archive.enabled === 'boolean' && (archive.count === undefined || Number.isFinite(archive.count))) {
    data.archive = archive as ArchiveStatus;
  }
  if (Array.isArray(body.endpoints)) data.endpoints = keep<EndpointMetric>(body.endpoints, 'endpoint', endpointProblem, leftOut);
  if (Array.isArray(body.sources)) data.sources = keep<SourceSyncResult>(body.sources, 'source', sourceProblem, leftOut);
  if (typeof body.lastSync === 'string' && !isNaN(Date.parse(body.lastSync))) data.lastSync = body.lastSync;
  return { ok: true, data, leftOut };
}

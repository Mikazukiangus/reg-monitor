// Status checks of the endpoints: each is asked once, and what happened is
// reported as it was (HTTP status, firewall or maintenance pages, timeouts).
import { logger } from './logging.js';
import { config } from '../runtime-config.js';
import { politeFetch, httpStatusText, RateLimitedError, describeError } from './http.js';
import { publicError } from './errors.js';
import { type EndpointDefinition, ENDPOINTS } from './sources/index.js';
import { openStore } from './store.js';
import { readShared, writeShared } from './shared-cache.js';

type EndpointStatus = 'Operational' | 'Degraded' | 'Down';

// Pages that return HTTP 200 but carry no usable content
const UNUSABLE_PAGE_TITLE = /maintenance|just a moment|attention required|access denied|service unavailable/i;
const FIREWALL_BLOCK_BODY = /your request has been blocked/i;

// Probe one endpoint and report what actually happened. Never invents a status.
async function probeEndpoint(ep: EndpointDefinition) {
  const start = Date.now();
  try {
    // Asked even while the site's circuit breaker is open, so the status is current
    const res = await politeFetch(ep.url, undefined, { probe: true });
    const body = await res.text();
    const pingMs = Date.now() - start;
    const pageTitle = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();

    let status: EndpointStatus;
    let detail: string;
    if (res.status >= 500) {
      status = 'Down';
      detail = httpStatusText(ep.url, res);
    } else if (!res.ok) {
      status = 'Degraded';
      if (FIREWALL_BLOCK_BODY.test(body)) {
        detail = `HTTP ${res.status}: blocked by site firewall (likely rate limiting)`;
      } else if (pageTitle && UNUSABLE_PAGE_TITLE.test(pageTitle)) {
        detail = `HTTP ${res.status}: blocked ("${pageTitle}")`;
      } else {
        detail = httpStatusText(ep.url, res);
      }
    } else if (pageTitle && UNUSABLE_PAGE_TITLE.test(pageTitle)) {
      status = 'Degraded';
      detail = `HTTP ${res.status} but page says "${pageTitle}"`;
    } else {
      status = 'Operational';
      detail = `HTTP ${res.status}`;
    }

    return { ...ep, status, statusCode: res.status, pingMs, detail: logger.errorMessage(detail) };
  } catch (err: any) {
    if (err instanceof RateLimitedError) {
      return { ...ep, status: 'Degraded' as EndpointStatus, statusCode: 429, pingMs: null, detail: logger.errorMessage(err) };
    }
    // Visitors see only a message written for them; the log has the detail
    logger.info(`[RegSonar] Status check of ${ep.name} failed: ${describeError(err)}`);
    return { ...ep, status: 'Down' as EndpointStatus, statusCode: null, pingMs: null, detail: publicError(err) };
  }
}

// Government APIs (HKMA in particular) rate-limit aggressively, so probes are
// cached rather than repeated on every client poll: by this instance, and with
// a history, for every instance (server/shared-cache.ts).
const HEALTH_TTL_MS = config.ingestion.healthTtlMs;

type Probe = Awaited<ReturnType<typeof probeEndpoint>>;
let healthCache: { at: number; results: Promise<Probe[]> } | null = null;

// The checks another instance made less than HEALTH_TTL_MS ago, or new ones,
// shared in turn. `entry.at` becomes the time they were made.
async function sharedOrProbed(entry: { at: number }): Promise<Probe[]> {
  const store = await openStore().catch(() => null);
  if (store) {
    const hit = (await readShared<{ at: number; results: Probe[] }>(store, ['health'], HEALTH_TTL_MS)).get('health');
    if (hit) {
      entry.at = hit.value.at;
      return hit.value.results;
    }
  }
  const results = await Promise.all(ENDPOINTS.map(probeEndpoint));
  if (store) await writeShared(store, [['health', { at: entry.at, results }]]);
  return results;
}

export function getEndpointsHealth(): Promise<Probe[]> {
  if (!healthCache || Date.now() - healthCache.at > HEALTH_TTL_MS) {
    const entry = { at: Date.now() } as { at: number; results: Promise<Probe[]> };
    entry.results = sharedOrProbed(entry);
    healthCache = entry;
  }
  return healthCache.results;
}

// When the endpoint checks now in use were made
export async function endpointsCheckedAt(): Promise<string> {
  await getEndpointsHealth();
  return new Date(healthCache!.at).toISOString();
}

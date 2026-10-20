// Status checks of the endpoints: each is asked once, and what happened is
// reported as it was (HTTP status, firewall or maintenance pages, timeouts).
import { logger } from './logging.js';
import { config } from '../runtime-config.js';
import { politeFetch, RateLimitedError, FETCH_TIMEOUT_MS } from './http.js';
import { type EndpointDefinition, ENDPOINTS } from './sources/index.js';

type EndpointStatus = 'Operational' | 'Degraded' | 'Down';

// Pages that return HTTP 200 but carry no usable content
const UNUSABLE_PAGE_TITLE = /maintenance|just a moment|attention required|access denied|service unavailable/i;
const FIREWALL_BLOCK_BODY = /your request has been blocked/i;

// Probe one endpoint and report what actually happened. Never invents a status.
async function probeEndpoint(ep: EndpointDefinition) {
  const start = Date.now();
  try {
    const res = await politeFetch(ep.url);
    const body = await res.text();
    const pingMs = Date.now() - start;
    const pageTitle = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();

    let status: EndpointStatus;
    let detail: string;
    if (res.status >= 500) {
      status = 'Down';
      detail = `HTTP ${res.status}`;
    } else if (!res.ok) {
      status = 'Degraded';
      if (FIREWALL_BLOCK_BODY.test(body)) {
        detail = `HTTP ${res.status}: blocked by site firewall (likely rate limiting)`;
      } else if (pageTitle && UNUSABLE_PAGE_TITLE.test(pageTitle)) {
        detail = `HTTP ${res.status}: blocked ("${pageTitle}")`;
      } else {
        detail = `HTTP ${res.status}`;
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
    const detail = err?.name === 'TimeoutError'
      ? `Timed out after ${FETCH_TIMEOUT_MS / 1000}s`
      : logger.errorMessage(err?.cause?.code || err);
    return { ...ep, status: 'Down' as EndpointStatus, statusCode: null, pingMs: null, detail };
  }
}

// Government APIs (HKMA in particular) rate-limit aggressively, so probes are
// cached rather than repeated on every client poll.
const HEALTH_TTL_MS = config.ingestion.healthTtlMs;

let healthCache: { at: number; results: Promise<Awaited<ReturnType<typeof probeEndpoint>>[]> } | null = null;

export function getEndpointsHealth() {
  if (!healthCache || Date.now() - healthCache.at > HEALTH_TTL_MS) {
    healthCache = { at: Date.now(), results: Promise.all(ENDPOINTS.map(probeEndpoint)) };
  }
  return healthCache.results;
}

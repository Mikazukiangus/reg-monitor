// Requests to regulator sites: the user agent each site accepts, timeouts,
// spacing for sites that rate-limit, and reading RSS feeds and paged lists.
import { logger } from './logging.js';
import { config } from '../runtime-config.js';
import { XMLParser } from 'fast-xml-parser';
import { BlockedAddressError, publicOnly } from './ssrf.js';
import { isPassingNetworkError, retryAfterMs, withRetry } from './retry.js';
import { CircuitBreaker } from './breaker.js';
import { SourceError } from './errors.js';

export const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

const REG_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (RegSonar-Feed-Gateway/2.0)';
// FINRA's Cloudflare setup challenges clients that look like a browser but
// aren't one, and serves the feed to a client that names itself plainly
const PLAIN_USER_AGENT = 'RegSonar-Feed-Gateway/2.0';
const PLAIN_AGENT_HOSTS = new Set(['www.finra.org']);
const userAgentFor = (url: string) => (PLAIN_AGENT_HOSTS.has(new URL(url).host) ? PLAIN_USER_AGENT : REG_USER_AGENT);
export const FETCH_TIMEOUT_MS = config.ingestion.fetchTimeoutMs;

// Some sites limit how often they may be asked, so requests to them are spaced
// out. After an HTTP 429 a site is left alone for as long as its Retry-After
// header says, or 15 minutes when it doesn't say (FINRA doesn't).
const HOST_SPACING_MS: Record<string, number> = { 'www.finra.org': 4000 };
const RATE_LIMIT_PAUSE_MS = config.ingestion.rateLimitPauseMs;
const hostQueue = new Map<string, Promise<void>>();
const hostPausedUntil = new Map<string, number>();

export class RateLimitedError extends SourceError {}

// A POST, for the one source (the ICO) whose page asks its search service that
// way. readOnly marks a POST that only reads, so it may be tried again like a GET.
type PostRequest = { method: 'POST'; body: string; contentType: string; readOnly?: boolean };

// Regulator sites are read over HTTPS only: a plain-HTTP address is refused,
// and so is a reply that a redirect brought from one, so nothing is read that
// could have been changed on the way
export class InsecureUrlError extends SourceError {}

// A site's gateway briefly unable to reach the site
const PASSING_STATUSES = new Set([502, 503, 504]);

// One circuit breaker per site (server/breaker.ts). A site that times out,
// breaks connections or answers 5xx BREAKER_FAILURES times in a row is not
// asked again for SITE_BREAKER_COOLDOWN_MS, so a site that is down costs one
// request per refresh rather than one time limit for every document on it.
// Any other answer, a 404 included, shows the site is up. A site's breaker
// is dropped once it has nothing to remember.
const siteBreakers = new Map<string, CircuitBreaker>();

// A request that could not reach the site: our time limit, or a network error
// (refused, reset, unknown name, certificate). Anything else (a request we
// refused to make, the site's own rate limit) says nothing about the site.
function siteFailure(err: any): string | undefined {
  if (err instanceof InsecureUrlError || err instanceof BlockedAddressError || err instanceof RateLimitedError) return undefined;
  if (err?.name === 'TimeoutError') return `timed out after ${FETCH_TIMEOUT_MS / 1000}s`;
  const code = err?.cause?.code ?? err?.code;
  return typeof code === 'string' ? code : undefined;
}

// A request to a regulator site. A read that fails for a passing reason (a
// dropped connection, HTTP 502/503/504) is tried again after a short pause
// (server/retry.ts); a POST that is not marked readOnly never is. A timeout
// is not retried, so a slow site still costs one FETCH_TIMEOUT_MS per try,
// until its circuit breaker opens. `probe`: an endpoint status check, which
// asks the site even while its breaker is open.
export async function politeFetch(url: string, post?: PostRequest, { probe = false } = {}): Promise<globalThis.Response> {
  if (new URL(url).protocol !== 'https:') throw new InsecureUrlError(`Refused a plain-HTTP address: ${url}`);
  const host = new URL(url).host;
  const safeToRepeat = !post || post.readOnly === true;
  let breaker = siteBreakers.get(host);
  if (!breaker) siteBreakers.set(host, breaker = new CircuitBreaker(host, config.breaker.failures, config.breaker.siteCooldownMs));
  try {
    return await breaker.run(() => withRetry(`Reading ${host}`, () => fetchOnce(url, host, post), {
      judge: res => (safeToRepeat && PASSING_STATUSES.has(res.status)
        ? { reason: `HTTP ${res.status}`, waitMs: retryAfterMs(res.headers.get('retry-after')) }
        : undefined),
      judgeError: (err: any) => (safeToRepeat && isPassingNetworkError(err) ? { reason: String(err?.cause?.code ?? err?.code) } : undefined),
      discard: res => { res.body?.cancel().catch(() => {}); }
    }), { result: res => (res.status >= 500 ? `HTTP ${res.status}` : undefined), error: siteFailure }, { probe });
  } finally {
    if (breaker.idle) siteBreakers.delete(host);
  }
}

async function fetchOnce(url: string, host: string, post?: PostRequest): Promise<globalThis.Response> {
  const pausedUntil = hostPausedUntil.get(host) ?? 0;
  if (Date.now() < pausedUntil) {
    throw new RateLimitedError(`HTTP 429: rate limited by the site, not asking again until ${new Date(pausedUntil).toISOString().slice(11, 16)} UTC`);
  }
  const spacing = HOST_SPACING_MS[host];
  if (spacing) {
    const previous = hostQueue.get(host) ?? Promise.resolve();
    hostQueue.set(host, previous.then(() => new Promise<void>(resolve => setTimeout(resolve, spacing))));
    await previous;
  }
  // Only public internet addresses, checked as each connection is made, every
  // redirect included (server/ssrf.ts)
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': userAgentFor(url), ...(post ? { 'Content-Type': post.contentType } : {}) },
    ...(post ? { method: post.method, body: post.body } : {}),
    dispatcher: publicOnly
  } as RequestInit).catch((err: any) => {
    // Say why, rather than fetch's own "fetch failed"
    throw err?.cause instanceof BlockedAddressError ? err.cause : err;
  });
  if (res.url && new URL(res.url).protocol !== 'https:') {
    await res.body?.cancel().catch(() => {});
    throw new InsecureUrlError(`Refused a redirect to plain HTTP: ${res.url}`);
  }
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    hostPausedUntil.set(host, Date.now() + (retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_PAUSE_MS));
  }
  return res;
}

export async function fetchOrThrow(url: string, post?: PostRequest): Promise<globalThis.Response> {
  const res = await politeFetch(url, post);
  if (!res.ok) {
    throw new SourceError(httpStatusText(url, res));
  }
  return res;
}

// Sites that have been down for a long time, and what they say about it, so a
// failure is not taken for a fault of the app. ftc.gov has answered every
// request with "Page Not Found" since at least 10 October 2026, from Hong Kong,
// from the US and in a browser, where it says its website is unavailable.
const KNOWN_OUTAGES: Record<string, string> = { 'www.ftc.gov': 'ftc.gov says "The FTC website is currently unavailable"' };

// What a failed reply's status says: "HTTP 404", with the reason when it is known
export function httpStatusText(url: string, res: globalThis.Response): string {
  const reason = KNOWN_OUTAGES[new URL(url).host];
  return reason ? `HTTP ${res.status}: ${reason}` : `HTTP ${res.status}`;
}

// The body of a response, refused as soon as it is larger than maxBytes: at
// once when the size it declares is too big, otherwise while it downloads, so
// an oversized file is never held in memory in full
export async function readLimitedBytes(res: globalThis.Response, maxBytes: number): Promise<Uint8Array> {
  const tooLarge = (bytes: number) => new Error(`File too large (over ${maxBytes} bytes; ${bytes} or more)`);
  const declared = Number(res.headers.get('content-length'));
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw tooLarge(declared);
  }
  if (!res.body) return new Uint8Array(await res.arrayBuffer());
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge(total);
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}

// Items of an RSS 2.0 feed, or an error if the response is not one
export async function rssItems(url: string): Promise<any[]> {
  const parsed = xmlParser.parse(await (await fetchOrThrow(url)).text());
  if (!parsed.rss?.channel) {
    throw new SourceError('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];
  return Array.isArray(items) ? items : [items];
}

// List pages read for `limit` items: one for the feed's usual read, more for
// a scheduled check or a backfill
export const pagesFor = (limit: number, perPage: number, max: number) => Math.min(max, Math.max(1, Math.ceil(limit / perPage)));

// Rows of a paged list. The first page must load; later pages are read one at
// a time and skipped if they fail.
export async function readPages<T>(urls: string[], parse: (html: string) => T[]): Promise<T[]> {
  const rows = parse(await (await fetchOrThrow(urls[0])).text());
  for (const url of urls.slice(1)) {
    try {
      rows.push(...parse(await (await fetchOrThrow(url)).text()));
    } catch (err: any) {
      logger.info(`[RegSonar Feed Sentinel] Skipped ${url}: ${describeError(err)}`);
    }
  }
  return rows;
}

export function describeError(err: any): string {
  if (err?.name === 'TimeoutError') return `Timed out after ${FETCH_TIMEOUT_MS / 1000}s`;
  return logger.errorMessage(err, 'Fetch failed');
}

// Requests to regulator sites: the user agent each site accepts, timeouts,
// spacing for sites that rate-limit, and reading RSS feeds and paged lists.
import { logger } from '../logging.js';
import { config } from '../runtime-config.js';
import { XMLParser } from 'fast-xml-parser';

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

export class RateLimitedError extends Error {}

// A POST, for the one source (the ICO) whose page asks its search service that way
type PostRequest = { method: 'POST'; body: string; contentType: string };

export async function politeFetch(url: string, post?: PostRequest): Promise<globalThis.Response> {
  const host = new URL(url).host;
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
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': userAgentFor(url), ...(post ? { 'Content-Type': post.contentType } : {}) },
    ...(post ? { method: post.method, body: post.body } : {})
  });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    hostPausedUntil.set(host, Date.now() + (retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_PAUSE_MS));
  }
  return res;
}

export async function fetchOrThrow(url: string, post?: PostRequest): Promise<globalThis.Response> {
  const res = await politeFetch(url, post);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res;
}

// Items of an RSS 2.0 feed, or an error if the response is not one
export async function rssItems(url: string): Promise<any[]> {
  const parsed = xmlParser.parse(await (await fetchOrThrow(url)).text());
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
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

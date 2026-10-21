// Reads a feed for a function in another region and passes on what the site
// answered: api/ftc-feed.ts runs in the US and reads the FTC's feed, which
// ftc.gov refuses to the app's functions in Hong Kong.
import { logger } from './logging.js';
import { politeFetch, readLimitedBytes, RELAYED_FROM_HEADER } from './http.js';
import { config } from '../runtime-config.js';

const MAX_FEED_BYTES = 5 * 1024 * 1024;

export interface RelayReply {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array | string;
}

// A feed that loads is kept by Vercel's CDN for 10 minutes, as long as the
// app's own fetches of a source are spaced; a failure for a minute, so the
// site is not asked again at every request
export async function relayFeed(url: string): Promise<RelayReply> {
  const headers = (cacheControl: string, contentType: string): Record<string, string> => ({
    'Cache-Control': cacheControl,
    'Content-Type': contentType,
    [RELAYED_FROM_HEADER]: new URL(url).host,
    ...(config.runtime.region ? { 'x-regsonar-relay-region': config.runtime.region } : {})
  });
  const failed = (status: number) => ({ status, headers: headers('public, s-maxage=60', 'text/plain; charset=utf-8'), body: '' });
  try {
    const res = await politeFetch(url);
    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      return failed(res.status);
    }
    const body = await readLimitedBytes(res, MAX_FEED_BYTES);
    return { status: 200, headers: headers('public, s-maxage=600, stale-while-revalidate=3600', res.headers.get('content-type') ?? 'application/xml'), body };
  } catch (err) {
    logger.warn(`[RegSonar Relay] ${url}: ${logger.errorMessage(err)}`);
    return failed(502);
  }
}

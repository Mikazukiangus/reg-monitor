// Server/build configuration schema. Keep this module pure so validation can
// be tested without reading a developer's .env or opening any connections.
import { isIP } from 'node:net';

type Environment = Readonly<Record<string, string | undefined>>;

export function createConfig(env: Environment) {
  const errors: string[] = [];
  const text = (name: string) => env[name]?.trim() || undefined;
  const invalid = (name: string, reason: string) => { errors.push(`${name}: ${reason}`); };
  const integer = (name: string, fallback: number, min = 1, max = 2_147_483_647) => {
    const raw = text(name);
    if (raw === undefined) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      invalid(name, `must be a whole number between ${min} and ${max}`);
      return fallback;
    }
    return value;
  };
  const boolean = (name: string, fallback = false) => {
    const raw = text(name);
    if (raw === undefined) return fallback;
    if (raw === 'true' || raw === '1') return true;
    if (raw === 'false' || raw === '0') return false;
    invalid(name, 'must be true, false, 1 or 0');
    return fallback;
  };
  const httpUrl = (name: string, raw: string | undefined) => {
    if (!raw) return undefined;
    try {
      const url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || /[?#]/.test(url.href)) throw new Error();
      return url.href.replace(/\/$/, '');
    } catch {
      invalid(name, 'must be an HTTP(S) URL without credentials, query or fragment');
      return undefined;
    }
  };

  const nodeEnv = text('NODE_ENV') ?? 'development';
  if (!['development', 'test', 'production'].includes(nodeEnv)) invalid('NODE_ENV', 'must be development, test or production');
  const port = integer('PORT', 3000, 1, 65535);
  const host = text('HOST') ?? '0.0.0.0';
  if (!isIP(host) && (host.length > 253 || /^[\d.]+$/.test(host) || !host.split('.').every(label => /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label)))) {
    invalid('HOST', 'must be an IP address or hostname without a scheme or port');
  }

  const databaseVariable = text('DATABASE_URL') ? 'DATABASE_URL' : 'POSTGRES_URL';
  const databaseUrl = text(databaseVariable);
  if (databaseUrl && databaseUrl !== 'pglite') {
    try {
      const url = new URL(databaseUrl);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error();
    } catch { invalid(databaseVariable, 'must be a postgres:// or postgresql:// URL, or pglite for local tests'); }
  }

  const productionHost = text('VERCEL_PROJECT_PRODUCTION_URL');
  let productionUrl: string | undefined;
  if (productionHost) {
    productionUrl = httpUrl('VERCEL_PROJECT_PRODUCTION_URL', `https://${productionHost}`);
    if (productionUrl && new URL(productionUrl).pathname !== '/') invalid('VERCEL_PROJECT_PRODUCTION_URL', 'must be a hostname without a scheme or path');
  }
  const digestSiteUrl = httpUrl('DIGEST_SITE_URL', text('DIGEST_SITE_URL'));
  const email = (value: string) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
  const to = (text('DIGEST_TO') ?? '').split(',').map(address => address.trim()).filter(Boolean);
  if (to.some(address => !email(address))) invalid('DIGEST_TO', 'must be a comma-separated list of email addresses');
  const from = text('DIGEST_FROM') ?? 'RegSonar <onboarding@resend.dev>';
  const sender = from.match(/^[^<>\r\n]+<([^<>]+)>$/)?.[1] ?? from;
  if (!email(sender) || /[\r\n]/.test(from)) invalid('DIGEST_FROM', 'must be an email address or Display Name <address>');
  const cronSecret = text('CRON_SECRET');
  const apiKey = text('RESEND_API_KEY');
  for (const [name, value] of [['CRON_SECRET', cronSecret], ['RESEND_API_KEY', apiKey]] as const) {
    if (value && /\s/.test(value)) invalid(name, 'must not contain whitespace');
  }

  const pollLimit = integer('POLL_LIMIT', 20, 1, 1000);
  const backfillLimit = integer('POLL_BACKFILL_LIMIT', 50, 1, 1000);
  if (backfillLimit < pollLimit) invalid('POLL_BACKFILL_LIMIT', 'must be greater than or equal to POLL_LIMIT');
  const cachePolicy = (ttl: string, ttlDefault: number, stale: string, staleDefault: number) => Object.freeze({
    maxAgeSeconds: integer(ttl, ttlDefault, 0, 31_536_000),
    staleSeconds: integer(stale, staleDefault, 0, 31_536_000)
  });
  const config = {
    runtime: Object.freeze({ nodeEnv, isProduction: nodeEnv === 'production', isVercel: boolean('VERCEL'), port, host, disableHmr: boolean('DISABLE_HMR') }),
    database: Object.freeze({ url: databaseUrl, poolMax: integer('DB_POOL_MAX', 3, 1, 100), idleTimeoutMs: integer('DB_IDLE_TIMEOUT_MS', 10_000) }),
    ingestion: Object.freeze({
      fetchTimeoutMs: integer('FETCH_TIMEOUT_MS', 8000),
      rateLimitPauseMs: integer('RATE_LIMIT_PAUSE_MS', 900_000),
      healthTtlMs: integer('HEALTH_TTL_MS', 300_000),
      sourceTtlMs: integer('SOURCE_TTL_MS', 600_000),
      syncReuseMs: integer('SYNC_REUSE_MS', 60_000)
    }),
    polling: Object.freeze({
      limit: pollLimit, backfillLimit,
      keyPointFetches: integer('POLL_KEY_POINT_FETCHES', 5, 0, 1000),
      fetchWindowMs: integer('POLL_FETCH_WINDOW_MS', 60_000),
      dateBackfillLimit: integer('POLL_DATE_BACKFILL_LIMIT', 5, 0, 1000),
      warmTimeoutMs: integer('FEED_WARM_TIMEOUT_MS', 30_000)
    }),
    archive: Object.freeze({ days: integer('ARCHIVE_FEED_DAYS', 30, 1, 3650), limit: integer('ARCHIVE_FEED_LIMIT', 300, 1, 10_000) }),
    refresh: Object.freeze({ limit: integer('REFRESH_LIMIT', 6, 1, 1000), windowMs: integer('REFRESH_WINDOW_MS', 60_000) }),
    digest: Object.freeze({
      cronSecret, apiKey, to: Object.freeze(to), from,
      siteUrl: digestSiteUrl ?? productionUrl ?? `http://localhost:${port}`,
      sendTimeoutMs: integer('RESEND_TIMEOUT_MS', 15_000),
      configured: Boolean(cronSecret && apiKey && to.length)
    }),
    cdn: Object.freeze({
      sync: cachePolicy('SYNC_CDN_TTL_SECONDS', 300, 'SYNC_CDN_STALE_SECONDS', 86_400),
      search: cachePolicy('SEARCH_CDN_TTL_SECONDS', 300, 'SEARCH_CDN_STALE_SECONDS', 3600)
    })
  };
  // Never include input values: database URLs and tokens contain secrets.
  if (errors.length) throw new Error(`Invalid environment configuration:\n${errors.map(error => `- ${error}`).join('\n')}`);
  return Object.freeze(config);
}

export type Config = ReturnType<typeof createConfig>;

export function cdnCacheControl(policy: Config['cdn']['sync']): string {
  return `public, s-maxage=${policy.maxAgeSeconds}, stale-while-revalidate=${policy.staleSeconds}`;
}

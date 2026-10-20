// The live feed, endpoint status and the scheduled check, for the feed routes
import { logger } from '../logging.js';
import { config } from '../../runtime-config.js';
import { reuseFor } from '../throttle.js';
import { SOURCES } from '../sources/index.js';
import { getEndpointsHealth } from '../health.js';
import { pollSources, refreshSource } from '../ingest.js';
import { withHistory } from '../history.js';
import { openStore, type StoreArg } from '../store.js';

// The feed: each source's latest notices (re-read at most every 10 minutes),
// recent notices from the history, and how each source and endpoint is doing.
// The history is opened once the sources are read.
export async function buildFeed(store?: StoreArg) {
  logger.info('[RegSonar Feed Sentinel] Querying live regulatory sources...');
  const [states, endpoints] = await Promise.all([
    Promise.all(SOURCES.map(refreshSource)),
    getEndpointsHealth()
  ]);
  const sources = SOURCES.map((s, i) => ({
    endpointId: s.endpointId,
    name: s.name,
    ok: !states[i].error,
    count: states[i].notices.length,
    lastSuccessAt: states[i].lastSuccessAt,
    error: states[i].error
  }));
  const { notices, archive } = await withHistory(states.flatMap(st => st.notices), store === undefined ? openStore() : store);
  return { count: notices.length, lastSync: new Date().toISOString(), notices, archive, sources, endpoints };
}

// The feed, built at most once a minute per server instance and shared by
// every request in between. Sources are re-read at most every 10 minutes
// anyway; this stops refreshes from re-reading the history database each time.
export const currentFeed = reuseFor(config.ingestion.syncReuseMs, () => buildFeed());

export async function endpointStatus() {
  const metrics = await getEndpointsHealth();
  return {
    lastChecked: new Date().toISOString(),
    totalEndpoints: metrics.length,
    operationalCount: metrics.filter(m => m.status === 'Operational').length,
    endpoints: metrics
  };
}

// The stored record of scheduled checks; reading it never starts one
export async function scheduledCheckStatus(storeArg: StoreArg = openStore()) {
  const store = await storeArg;
  return store ? { enabled: true as const, ...await store.checkStatus() } : { enabled: false as const };
}

// Check every source and store what it lists in the history, then ask for the
// public feed so the cached copy visitors get is refreshed too
export async function runScheduledCheck(store: StoreArg = openStore()) {
  const { results, failed, pageDatesFound } = await pollSources(store);
  const added = results.reduce((sum, r) => sum + r.added, 0);
  logger.info(`[RegSonar Poll] ${added} new notices from ${results.length} sources${failed.length ? `; could not read ${failed.map(f => f.name).join(', ')}` : ''}`);
  const warmed = await fetch(`${config.digest.siteUrl}/api/feeds/sync`, { signal: AbortSignal.timeout(config.polling.warmTimeoutMs) })
    .then(r => r.ok)
    .catch(() => false);
  return {
    added,
    pageDatesFound,
    feedRefreshed: warmed,
    sources: results.map(({ notices: _notices, ...r }) => r),
    failed
  };
}

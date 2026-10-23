// The live feed, endpoint status and the scheduled check, for the feed routes
import { logger } from '../logging.js';
import { config } from '../../runtime-config.js';
import { reuseFor } from '../throttle.js';
import { SOURCES } from '../sources/index.js';
import { getEndpointsHealth } from '../health.js';
import { pollSources, refreshSource } from '../ingest.js';
import { withHistory } from '../history.js';
import { enrichWithKeyPoints, NO_FETCHES } from '../enrich.js';
import { drainQueue } from '../queue.js';
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
  const storeArg = store === undefined ? openStore() : store;
  // Key points stored since the sources were read, by background jobs
  const live = await enrichWithKeyPoints(states.flatMap(st => st.notices), NO_FETCHES, storeArg);
  const { notices, archive } = await withHistory(live, storeArg);
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
  if (!store) return { enabled: false as const };
  // How many background jobs are waiting, and how many gave up this week
  const [status, queue] = await Promise.all([store.checkStatus(), store.jobCounts()]);
  return { enabled: true as const, ...status, queue };
}

// A scheduled check runs queued jobs until this long after it started, leaving
// time to refresh the feed (up to FEED_WARM_TIMEOUT_MS) within the 120 s a
// function may run
const CHECK_QUEUE_UNTIL_MS = 75_000;

// Check every source and store what it lists in the history, then ask for the
// public feed so the cached copy visitors get is refreshed too
export async function runScheduledCheck(storeArg: StoreArg = openStore()) {
  const started = Date.now();
  const store = await storeArg;
  const { results, failed, pageDatesFound } = await pollSources(store);
  const added = results.reduce((sum, r) => sum + r.added, 0);
  logger.info(`[RegSonar Poll] ${added} new notices from ${results.length} sources${failed.length ? `; could not read ${failed.map(f => f.name).join(', ')}` : ''}`);
  // Then queued jobs (documents to read, a digest to send again), with the time left
  let jobs: { ran: number; failed: number } | undefined;
  if (store) {
    try {
      const outcomes = await drainQueue(store, { until: started + CHECK_QUEUE_UNTIL_MS });
      await store.pruneJobs();
      jobs = { ran: outcomes.length, failed: outcomes.filter(o => !o.ok).length };
      logger.info(`[RegSonar Queue] Ran ${jobs.ran} jobs${jobs.failed ? `, ${jobs.failed} failed` : ''}`);
    } catch (err: any) {
      logger.warn('[RegSonar Queue] Could not run jobs', err);
    }
  }
  const warmed = await fetch(`${config.digest.siteUrl}/api/feeds/sync`, { signal: AbortSignal.timeout(config.polling.warmTimeoutMs) })
    .then(r => {
      if (!r.ok) logger.warn(`[RegSonar Poll] The feed was not refreshed: HTTP ${r.status}`);
      return r.ok;
    })
    .catch((err: any) => {
      logger.warn('[RegSonar Poll] The feed was not refreshed', err);
      return false;
    });
  return {
    added,
    pageDatesFound,
    feedRefreshed: warmed,
    jobs,
    sources: results.map(({ notices: _notices, ...r }) => r),
    failed
  };
}

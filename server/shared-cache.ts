// Work every server instance would otherwise repeat: reading each source's
// list (51 regulator sites) and checking the endpoints (41 more requests).
// Each instance keeps its own copy for a while, but on Vercel new instances
// start all the time, and each used to read every site again before its first
// answer (about 5 seconds, and more requests to sites that rate-limit). With a
// history database, what one instance read is stored for the others, which use
// it until it is as old as the instance's own copy may be (SOURCE_TTL_MS,
// HEALTH_TTL_MS).
//
// Entries are keyed by deployment, so a new deployment, whose code may read a
// site differently, never uses what the last one stored; the scheduled check
// removes entries a day old. A failure here is logged and the work is done
// as if there were no cache.
import { logger } from './logging.js';
import { config } from '../runtime-config.js';
import type { NoticeStore } from './store.js';

const key = (name: string) => `${config.runtime.deploymentId}/${name}`;

// Entries stored less than maxAgeMs ago, by name, with when they were stored
export async function readShared<T>(store: NoticeStore, names: string[], maxAgeMs: number): Promise<Map<string, { value: T; at: number }>> {
  try {
    const rows = await store.cached(names.map(key), maxAgeMs);
    return new Map(names.flatMap(name => {
      const row = rows.get(key(name));
      return row ? [[name, row as { value: T; at: number }] as const] : [];
    }));
  } catch (err: any) {
    logger.warn('[RegSonar Cache] Could not read the shared cache', err);
    return new Map();
  }
}

export async function writeShared(store: NoticeStore, entries: [string, unknown][]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await store.cache(entries.map(([name, value]) => [key(name), value]));
  } catch (err: any) {
    logger.warn('[RegSonar Cache] Could not write the shared cache', err);
  }
}

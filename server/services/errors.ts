// What error tracking recorded (server/error-tracking.ts), as GET /api/errors
// shows it: one occurrence by the reference a visitor was shown, or the kinds
// of error seen lately
import { openStore, type StoreArg } from '../store.js';

export async function errorOccurrence(reference: string, storeArg: StoreArg = openStore()) {
  const store = await storeArg;
  if (!store) return { enabled: false as const };
  return { enabled: true as const, occurrence: await store.errorEvent(reference) };
}

export async function recentErrorKinds(hours: number, limit: number, storeArg: StoreArg = openStore()) {
  const store = await storeArg;
  if (!store) return { enabled: false as const };
  return { enabled: true as const, kinds: await store.errorKinds(hours * 3_600_000, limit) };
}

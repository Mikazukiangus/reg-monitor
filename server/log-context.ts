// What every log entry written while a request or job is running says about
// it (server/logging.ts adds it): the request, the visitor, the job. Kept in
// AsyncLocalStorage, so it follows the work through awaits, timers and the
// work done after the response, without being passed along by hand.
import { AsyncLocalStorage } from 'node:async_hooks';

export interface LogContext {
  request?: { id: string; method: string; path: string };
  // The visitor's hashed key (server/rate-limits.ts visitorKeys); never the address
  visitor?: string;
  // target: what the job is for (a notice id, a digest day); not "key", which the redactor hides
  job?: { id: string; kind: string; target: string; attempt: number };
}

const storage = new AsyncLocalStorage<LogContext>();

// The context of the running request or job, if any
export const logContext = (): LogContext | undefined => storage.getStore();

// Run fn with these fields added to the current context
export function withLogContext<T>(fields: LogContext, fn: () => T): T {
  return storage.run({ ...storage.getStore(), ...fields }, fn);
}

// What visitors are told when something fails. Source errors, endpoint status
// details and the scheduled check's summary are public, so they carry only
// messages written for visitors; any other error (a database error, a bug in
// a parser) is reported as a fixed message, and its detail goes to the log.
import { config } from '../runtime-config.js';

// An error whose message is written to be shown: a site's HTTP status, a
// reply that was not what the source expects, a request the app refused
export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export const UNEXPLAINED = 'Failed (details in the server log)';

export function publicError(err: any): string {
  if (err instanceof SourceError) return err.message;
  if (err?.name === 'TimeoutError') return `Timed out after ${config.ingestion.fetchTimeoutMs / 1000}s`;
  // fetch's own "fetch failed", with the network's reason (refused, reset,
  // unknown name, certificate)
  if (err instanceof TypeError && typeof (err as any).cause?.code === 'string') return `Network error: ${(err as any).cause.code}`;
  return UNEXPLAINED;
}

// The cursor a search page hands back for the next page: where the page
// ended (server/db.ts, SearchPosition), as opaque URL-safe text. A cursor that
// was altered only changes where the next page starts: its values are checked
// here and passed to the query as parameters.
import type { SearchPosition } from './store.js';

// Room for the longest notice id (240 characters, as by-id accepts)
const MAX_CURSOR_LENGTH = 512;
const RANK = /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;
// A timestamptz as Postgres writes it (DateStyle ISO), or -infinity for no date
const TIMESTAMP = /^(?:-infinity|\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?[+-]\d{2}(?::\d{2}){0,2})$/;

export const encodeCursor = (p: SearchPosition): string =>
  Buffer.from(JSON.stringify([p.rank, p.publishedAt, p.id])).toString('base64url');

// The position, or undefined when the text is not a cursor this server made
export function decodeCursor(raw: string): SearchPosition | undefined {
  if (raw.length > MAX_CURSOR_LENGTH || !/^[\w-]+$/.test(raw)) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return undefined;
  }
  if (!Array.isArray(value) || value.length !== 3 || !value.every(v => typeof v === 'string')) return undefined;
  const [rank, publishedAt, id] = value as string[];
  if (!RANK.test(rank) || !Number.isFinite(Number(rank))) return undefined;
  if (!TIMESTAMP.test(publishedAt)) return undefined;
  if (id.length === 0 || id.length > 240) return undefined;
  return { rank, publishedAt, id };
}

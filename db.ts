// Notice history, kept in Postgres (Neon in production, linked through the
// Vercel project's Storage tab, which sets DATABASE_URL). Without a database
// URL the history is off and the site works from the live feeds alone.
// DATABASE_URL=pglite runs an in-memory Postgres (PGlite) for local testing.
import pg from 'pg';

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS notices (
  id text PRIMARY KEY,
  regulator text NOT NULL,
  jurisdiction_code text NOT NULL,
  format text NOT NULL,
  title text NOT NULL,
  published_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL,
  search tsvector GENERATED ALWAYS AS (
    to_tsvector('english', title || ' ' || coalesce(data->>'summary', '') || ' ' || coalesce(data->'keyPoints'->>'points', ''))
  ) STORED
);
CREATE INDEX IF NOT EXISTS notices_published_idx ON notices (published_at DESC);
CREATE INDEX IF NOT EXISTS notices_search_idx ON notices USING gin (search);
`;

let dbPromise: Promise<Db | null> | null = null;

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

async function connect(url: string): Promise<Db> {
  let db: Db;
  if (url.startsWith('pglite')) {
    // Imported by a variable name so Vercel's bundler leaves this dev-only package out
    const pgliteModule = '@electric-sql/pglite';
    const { PGlite } = await import(pgliteModule);
    const lite = new PGlite();
    db = { query: async (sql, params) => (await lite.query(sql, params as any[])).rows };
    await lite.exec(SCHEMA);
  } else {
    // A small pool: each serverless instance handles a few requests at a time
    const pool = new pg.Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
    db = { query: async (sql, params) => (await pool.query(sql, params as any[])).rows };
    await pool.query(SCHEMA);
  }
  return db;
}

// The database, or null when none is configured or it can't be reached
export function getDb(): Promise<Db | null> {
  const url = databaseUrl();
  if (!url) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = connect(url).catch(err => {
      console.log(`[RegSonar History] Database unavailable: ${err?.message}`);
      dbPromise = null;
      return null;
    });
  }
  return dbPromise;
}

export interface StoredNotice {
  id: string;
  regulator: string;
  jurisdictionCode: string;
  format: string;
  title: string;
  publishedAt?: string;
  keyPoints?: unknown;
  [key: string]: unknown;
}

// Insert or refresh notices. Key points already stored are kept when the
// new copy has none (for example when a document fetch failed this time).
export async function saveNotices(db: Db, notices: StoredNotice[]): Promise<void> {
  for (let i = 0; i < notices.length; i += 50) {
    const batch = notices.slice(i, i + 50);
    const values: unknown[] = [];
    const rows = batch.map((n, j) => {
      values.push(n.id, n.regulator, n.jurisdictionCode, n.format, n.title, n.publishedAt || null, JSON.stringify(n));
      const k = j * 7;
      return `($${k + 1}, $${k + 2}, $${k + 3}, $${k + 4}, $${k + 5}, $${k + 6}, $${k + 7}::jsonb)`;
    });
    await db.query(
      `INSERT INTO notices (id, regulator, jurisdiction_code, format, title, published_at, data)
       VALUES ${rows.join(', ')}
       ON CONFLICT (id) DO UPDATE SET
         regulator = EXCLUDED.regulator,
         jurisdiction_code = EXCLUDED.jurisdiction_code,
         format = EXCLUDED.format,
         title = EXCLUDED.title,
         published_at = COALESCE(EXCLUDED.published_at, notices.published_at),
         last_seen_at = now(),
         data = CASE
           WHEN EXCLUDED.data ? 'keyPoints' OR NOT notices.data ? 'keyPoints' THEN EXCLUDED.data
           ELSE EXCLUDED.data || jsonb_build_object('keyPoints', notices.data->'keyPoints')
         END`,
      values
    );
  }
}

const rowToNotice = (row: { data: any }) => (typeof row.data === 'string' ? JSON.parse(row.data) : row.data);

// Notices published in the last `days` days, newest first
export async function recentNotices(db: Db, days: number, limit: number): Promise<StoredNotice[]> {
  const rows = await db.query(
    `SELECT data FROM notices WHERE published_at >= now() - make_interval(days => $1) ORDER BY published_at DESC LIMIT $2`,
    [days, limit]
  );
  return rows.map(rowToNotice);
}

// Full-text search over titles, summaries and key points, best matches first
export async function searchNotices(db: Db, query: string, limit: number): Promise<StoredNotice[]> {
  const rows = await db.query(
    `SELECT data FROM notices
     WHERE search @@ websearch_to_tsquery('english', $1)
     ORDER BY ts_rank(search, websearch_to_tsquery('english', $1)) DESC, published_at DESC NULLS LAST
     LIMIT $2`,
    [query, limit]
  );
  return rows.map(rowToNotice);
}

// Consultations and conclusions, for linking the two (titles and dates only)
export async function consultationCandidates(db: Db, limit = 2000): Promise<StoredNotice[]> {
  const rows = await db.query(
    `SELECT jsonb_build_object('id', id, 'regulator', regulator, 'jurisdictionCode', jurisdiction_code, 'format', format,
       'title', title, 'publishedAt', published_at, 'dossierUrl', data->>'dossierUrl') AS data
     FROM notices
     WHERE format = 'Consultations' OR title ~* '(conclu|response to (the )?consultation)'
     ORDER BY published_at DESC NULLS LAST LIMIT $1`,
    [limit]
  );
  return rows.map(rowToNotice);
}

export async function archiveStats(db: Db): Promise<{ count: number; since: string | null }> {
  const [row] = await db.query<{ count: string; since: Date | string | null }>(`SELECT count(*) AS count, min(published_at) AS since FROM notices`);
  return { count: Number(row?.count || 0), since: row?.since ? new Date(row.since).toISOString() : null };
}

// The stored copies of these notices, by id (for reusing key points and
// spotting where a source's list joins up with what is already stored)
export async function storedNotices(db: Db, ids: string[]): Promise<Map<string, StoredNotice>> {
  if (ids.length === 0) return new Map();
  const rows = await db.query(`SELECT data FROM notices WHERE id = ANY($1::text[])`, [ids]);
  return new Map(rows.map(rowToNotice).map((n: StoredNotice) => [n.id, n]));
}

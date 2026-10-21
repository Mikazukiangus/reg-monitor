// Notice history, kept in Postgres (Neon in production, linked through the
// Vercel project's Storage tab, which sets DATABASE_URL). Without a database
// URL the history is off and the site works from the live feeds alone.
// DATABASE_URL=pglite runs an in-memory Postgres (PGlite) for local testing.
import pg from 'pg';
import { config } from '../runtime-config.js';
import { logger } from './logging.js';
import type { CheckSummary } from '../shared/regulatory.js';
import { migrate } from './migrations.js';

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
}

let dbPromise: Promise<Db | null> | null = null;

export function databaseUrl(): string | undefined {
  return config.database.url;
}

async function connect(url: string): Promise<Db> {
  let db: Db;
  if (url.startsWith('pglite')) {
    // Imported by a variable name so Vercel's bundler leaves this dev-only package out
    const pgliteModule = '@electric-sql/pglite';
    const { PGlite } = await import(pgliteModule);
    const lite = new PGlite();
    db = { query: async (sql, params) => (await lite.query(sql, params as any[])).rows };
    await migrate({ exec: async sql => { await lite.exec(sql); }, query: db.query });
  } else {
    // A small pool: each serverless instance handles a few requests at a time
    const pool = new pg.Pool({ connectionString: url, max: config.database.poolMax, idleTimeoutMillis: config.database.idleTimeoutMs });
    db = { query: async (sql, params) => (await pool.query(sql, params as any[])).rows };
    // The schema's changes (server/migrations.ts), on one connection of the pool
    const client = await pool.connect().catch(async err => { await pool.end().catch(() => {}); throw err; });
    try {
      await migrate({ exec: async sql => { await client.query(sql); }, query: async (sql, params) => (await client.query(sql, params as any[])).rows });
    } catch (err) {
      client.release();
      await pool.end().catch(() => {});
      throw err;
    }
    client.release();
  }
  return db;
}

// The database, or null when none is configured or it can't be reached
export function getDb(): Promise<Db | null> {
  const url = databaseUrl();
  if (!url) return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = connect(url).catch(err => {
      logger.warn('[RegSonar History] Database unavailable', err);
      dbPromise = null;
      return null;
    });
  }
  return dbPromise;
}

// A notice as the table holds it (the whole notice is in the data column);
// server/store.ts gives it its full type
export interface StoredRow {
  id: string;
  regulator: string;
  regulatorId?: string;
  jurisdictionCode: string;
  format: string;
  title: string;
  publishedAt?: string;
  keyPoints?: unknown;
  [key: string]: unknown;
}

// Insert or refresh notices. Key points already stored are kept when the
// new copy has none (for example when a document fetch failed this time).
// sourceId: the source that read them, recorded in notice_sources.
export async function saveNotices(db: Db, notices: StoredRow[], sourceId?: string): Promise<void> {
  // Postgres refuses an INSERT ... ON CONFLICT that changes one row twice, so
  // an id listed twice would lose its whole batch: the first copy is kept
  const seen = new Set<string>();
  notices = notices.filter(n => !seen.has(n.id) && !!seen.add(n.id));
  for (let i = 0; i < notices.length; i += 50) {
    const batch = notices.slice(i, i + 50);
    const values: unknown[] = [];
    const rows = batch.map((n, j) => {
      values.push(n.id, n.regulator, n.regulatorId || null, n.jurisdictionCode, n.format, n.title, n.publishedAt || null, JSON.stringify(n));
      const k = j * 8;
      return `($${k + 1}, $${k + 2}, $${k + 3}, $${k + 4}, $${k + 5}, $${k + 6}, $${k + 7}, $${k + 8}::jsonb)`;
    });
    await db.query(
      `INSERT INTO notices (id, regulator, regulator_id, jurisdiction_code, format, title, published_at, data)
       VALUES ${rows.join(', ')}
       ON CONFLICT (id) DO UPDATE SET
         regulator = EXCLUDED.regulator,
         regulator_id = COALESCE(EXCLUDED.regulator_id, notices.regulator_id),
         jurisdiction_code = EXCLUDED.jurisdiction_code,
         format = EXCLUDED.format,
         title = EXCLUDED.title,
         published_at = COALESCE(EXCLUDED.published_at, notices.published_at),
         last_seen_at = now(),
         data = (CASE
           WHEN EXCLUDED.data ? 'keyPoints' OR NOT notices.data ? 'keyPoints' THEN EXCLUDED.data
           ELSE EXCLUDED.data || jsonb_build_object('keyPoints', notices.data->'keyPoints')
         END) || CASE
           WHEN EXCLUDED.published_at IS NULL AND notices.published_at IS NOT NULL
             THEN jsonb_build_object('publishedAt', notices.data->>'publishedAt')
           ELSE '{}'::jsonb
         END`,
      values
    );
    if (sourceId) {
      await db.query(
        `INSERT INTO notice_sources (notice_id, source_id) SELECT unnest($1::text[]), $2
         ON CONFLICT (notice_id, source_id) DO UPDATE SET last_seen_at = now()`,
        [batch.map(n => n.id), sourceId]
      );
    }
  }
}

const rowToNotice = (row: { data: any }) => (typeof row.data === 'string' ? JSON.parse(row.data) : row.data);

// Notices published in the last `days` days, newest first, leaving out
// `excludeIds` (those the caller already has, so they don't count against the limit)
export async function recentNotices(db: Db, days: number, limit: number, excludeIds: string[] = []): Promise<StoredRow[]> {
  const rows = await db.query(
    `SELECT data FROM notices WHERE published_at >= now() - make_interval(days => $1) AND NOT (id = ANY($3::text[]))
     ORDER BY published_at DESC LIMIT $2`,
    [days, limit, excludeIds]
  );
  return rows.map(rowToNotice);
}

// Full-text search over titles, summaries and key points, best matches first
export async function searchNotices(db: Db, query: string, limit: number): Promise<StoredRow[]> {
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
// What matching consultations to outcomes needs of each notice
// (shared/related.ts): all of them, or a few regulators'
export async function linkCandidates(db: Db, regulators?: string[]): Promise<StoredRow[]> {
  const rows = await db.query(
    `SELECT jsonb_build_object('id', id, 'regulator', regulator, 'jurisdictionCode', jurisdiction_code, 'format', format,
       'title', title, 'publishedAt', data->>'publishedAt', 'dossierUrl', data->>'dossierUrl') AS data
     FROM notices ${regulators ? 'WHERE regulator = ANY($1::text[])' : ''}`,
    regulators ? [regulators] : []
  );
  return rows.map(rowToNotice);
}

export interface LinkRow { consultationId: string; conclusionId: string; score: number }

const linkColumns = (links: LinkRow[]) =>
  [links.map(l => l.consultationId), links.map(l => l.conclusionId), links.map(l => l.score)];

// Add links (a link found again keeps when it was first found)
export async function addLinks(db: Db, links: LinkRow[]): Promise<void> {
  if (links.length === 0) return;
  await db.query(
    `INSERT INTO notice_links (consultation_id, conclusion_id, score)
     SELECT * FROM unnest($1::text[], $2::text[], $3::real[])
     ON CONFLICT (consultation_id, conclusion_id) DO UPDATE SET score = EXCLUDED.score`,
    linkColumns(links)
  );
}

// Make the stored links exactly these, in one statement
export async function replaceLinks(db: Db, links: LinkRow[]): Promise<void> {
  await db.query(
    `WITH found (consultation_id, conclusion_id, score) AS (SELECT * FROM unnest($1::text[], $2::text[], $3::real[])),
     gone AS (
       DELETE FROM notice_links l WHERE NOT EXISTS (
         SELECT 1 FROM found f WHERE f.consultation_id = l.consultation_id AND f.conclusion_id = l.conclusion_id)
     )
     INSERT INTO notice_links (consultation_id, conclusion_id, score) SELECT * FROM found
     ON CONFLICT (consultation_id, conclusion_id) DO UPDATE SET score = EXCLUDED.score`,
    linkColumns(links)
  );
}

// The stored links of these notices, with what is shown of the notices at
// either end
export async function linksOf(db: Db, ids: string[]): Promise<{ links: LinkRow[]; notices: StoredRow[] }> {
  if (ids.length === 0) return { links: [], notices: [] };
  const rows = await db.query(
    `SELECT l.consultation_id, l.conclusion_id, l.score, n.id, n.regulator, n.format, n.title,
       n.data->>'publishedAt' AS published_at, n.data->>'dossierUrl' AS dossier_url
     FROM notice_links l JOIN notices n ON n.id IN (l.consultation_id, l.conclusion_id)
     WHERE l.consultation_id = ANY($1::text[]) OR l.conclusion_id = ANY($1::text[])`,
    [ids]
  );
  const links = new Map<string, LinkRow>();
  const notices = new Map<string, StoredRow>();
  for (const r of rows) {
    links.set(`${r.consultation_id} ${r.conclusion_id}`, { consultationId: r.consultation_id, conclusionId: r.conclusion_id, score: Number(r.score) });
    notices.set(r.id, { id: r.id, regulator: r.regulator, jurisdictionCode: '', format: r.format, title: r.title,
      publishedAt: r.published_at ?? undefined, dossierUrl: r.dossier_url ?? undefined });
  }
  return { links: [...links.values()], notices: [...notices.values()] };
}

// What working out a notice's dates needs of each stored notice
// (server/dates.ts), without the rest of its key points
export async function dateFields(db: Db): Promise<StoredRow[]> {
  const rows = await db.query(
    `SELECT jsonb_strip_nulls(jsonb_build_object('id', id, 'type', data->'type', 'title', title,
       'sourceDates', data->'sourceDates', 'statutoryDeadline', data->'statutoryDeadline', 'deadlineQuote', data->'deadlineQuote',
       'keyPoints', jsonb_strip_nulls(jsonb_build_object(
         'dates', data->'keyPoints'->'dates', 'closingDate', data->'keyPoints'->'closingDate', 'facts', data->'keyPoints'->'facts')))) AS data
     FROM notices`
  );
  return rows.map(rowToNotice);
}

export interface DateRow { noticeId: string; source: 'regulator' | 'document'; kind: string; date: string; general: boolean; quote?: string }

// Make the stored dates of these notices (of every notice, without ids)
// exactly these, in one statement
export async function replaceDates(db: Db, dates: DateRow[], ids?: string[]): Promise<void> {
  await db.query(
    `WITH found (notice_id, source, kind, date, general, quote) AS (
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::date[], $5::boolean[], $6::text[])),
     gone AS (
       DELETE FROM notice_dates d WHERE ($7::text[] IS NULL OR d.notice_id = ANY($7::text[])) AND NOT EXISTS (
         SELECT 1 FROM found f WHERE (f.notice_id, f.source, f.kind, f.date) = (d.notice_id, d.source, d.kind, d.date))
     )
     INSERT INTO notice_dates (notice_id, source, kind, date, general, quote) SELECT * FROM found
     ON CONFLICT (notice_id, source, kind, date) DO UPDATE SET general = EXCLUDED.general, quote = EXCLUDED.quote`,
    [dates.map(d => d.noticeId), dates.map(d => d.source), dates.map(d => d.kind), dates.map(d => d.date),
      dates.map(d => d.general), dates.map(d => d.quote ?? null), ids ?? null]
  );
}

// Stored notices with no date whose page has not yet been checked for one
// (the FCA's feed gives none), oldest seen first
export async function undatedNotices(db: Db, limit: number): Promise<StoredRow[]> {
  const rows = await db.query(
    `SELECT data FROM notices
     WHERE published_at IS NULL AND data ? 'dossierUrl' AND NOT data ? 'pageDateTried'
       AND NOT COALESCE(data->'keyPoints' ? 'published', false)
     ORDER BY last_seen_at LIMIT $1`,
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
export async function storedNotices(db: Db, ids: string[]): Promise<Map<string, StoredRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db.query(`SELECT data FROM notices WHERE id = ANY($1::text[])`, [ids]);
  return new Map(rows.map(rowToNotice).map((n: StoredRow) => [n.id, n]));
}

export interface ScheduledCheck {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: 'running' | 'completed' | 'failed';
  summary: CheckSummary | null;
}
export async function saveScheduledCheck(db: Db, check: ScheduledCheck): Promise<void> {
  await db.query(`INSERT INTO scheduled_checks (id, started_at, completed_at, status, summary)
    VALUES ($1, $2, $3, $4, $5::jsonb)
    ON CONFLICT (id) DO UPDATE SET completed_at = EXCLUDED.completed_at, status = EXCLUDED.status, summary = EXCLUDED.summary`,
  [check.id, check.startedAt, check.completedAt, check.status, JSON.stringify(check.summary)]);
}
export async function scheduledCheckStatus(db: Db) {
  const rows = await db.query(`SELECT id, started_at, completed_at, status, summary FROM scheduled_checks ORDER BY started_at DESC LIMIT 1`);
  const completed = await db.query(`SELECT completed_at FROM scheduled_checks WHERE status = 'completed' ORDER BY completed_at DESC LIMIT 1`);
  const [counts] = await db.query(`SELECT
    count(*) FILTER (WHERE NOT data ? 'pageDateTried' AND NOT COALESCE(data->'keyPoints' ? 'published', false)) AS pending,
    count(*) FILTER (WHERE data ? 'pageDateTried' OR COALESCE(data->'keyPoints' ? 'published', false)) AS unresolved
    FROM notices WHERE published_at IS NULL AND data ? 'dossierUrl' AND regulator = 'UK FCA'`);
  const row = rows[0];
  return {
    latest: row ? { id: row.id, startedAt: new Date(row.started_at).toISOString(),
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      status: row.status, summary: row.summary } : null,
    lastCompletedAt: completed[0]?.completed_at ? new Date(completed[0].completed_at).toISOString() : null,
    dateBackfill: { pending: Number(counts?.pending || 0), unresolved: Number(counts?.unresolved || 0) }
  };
}

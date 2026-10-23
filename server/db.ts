// Notice history, kept in Postgres (Neon in production, linked through the
// Vercel project's Storage tab, which sets DATABASE_URL). Without a database
// URL the history is off and the site works from the live feeds alone.
// DATABASE_URL=pglite runs an in-memory Postgres (PGlite) for local testing.
import pg from 'pg';
import { config } from '../runtime-config.js';
import { logger } from './logging.js';
import type { CheckSummary } from '../shared/regulatory.js';
import { migrate } from './migrations.js';
import { CircuitBreaker, CircuitOpenError } from './breaker.js';

export interface Db {
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
  // Runs fn on one connection inside BEGIN ... COMMIT (ROLLBACK if it throws)
  transaction?<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

let dbPromise: Promise<Db | null> | null = null;

// The database's circuit breaker (server/breaker.ts): after BREAKER_FAILURES
// failed connections or queries in a row (time limits, broken or refused
// connections), the history is treated as off for DB_BREAKER_COOLDOWN_MS
// rather than every request waiting out the connection limit. An error the
// database itself reports (bad SQL, a constraint) shows it is up.
const databaseBreaker = new CircuitBreaker('The history database', config.breaker.failures, config.breaker.databaseCooldownMs);
// The reason it names is shown to visitors (a check's summary), so it is an
// error code or a fixed phrase, never the driver's message
const databaseJudge = {
  error: (err: any) => (err instanceof pg.DatabaseError ? undefined
    : typeof err?.code === 'string' ? err.code : /timeout/i.test(String(err?.message)) ? 'timed out' : 'connection failed')
};

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
    db = {
      query: async (sql, params) => (await lite.query(sql, params as any[])).rows,
      transaction: fn => lite.transaction((tx: any) => fn({ query: async (sql, params) => (await tx.query(sql, params as any[])).rows }))
    };
    await migrate({ exec: async sql => { await lite.exec(sql); }, query: db.query });
  } else {
    // A small pool: each serverless instance handles a few requests at a time.
    // Waiting for a connection (Neon may be waking up, or the pool busy) and for
    // each query's answer are both limited, so a stuck database fails the
    // request instead of holding it until the function's time runs out. The
    // query limit is the client's: a query past it is reported as failed but
    // runs on in Postgres (statement_timeout is not set, as Neon's connection
    // pooler may refuse it as a connection setting).
    const pool = new pg.Pool({
      connectionString: url, max: config.database.poolMax, idleTimeoutMillis: config.database.idleTimeoutMs,
      connectionTimeoutMillis: config.database.connectTimeoutMs, query_timeout: config.database.queryTimeoutMs
    });
    db = {
      query: (sql, params) => databaseBreaker.run(async () => (await pool.query(sql, params as any[])).rows, databaseJudge),
      transaction: fn => databaseBreaker.run(async () => {
        const client = await pool.connect();
        let broken = false;
        try {
          await client.query('BEGIN');
          const result = await fn({ query: async (sql, params) => (await client.query(sql, params as any[])).rows });
          await client.query('COMMIT');
          return result;
        } catch (err) {
          // A connection that cannot even roll back is closed, not reused
          await client.query('ROLLBACK').catch(() => { broken = true; });
          throw err;
        } finally {
          client.release(broken);
        }
      }, databaseJudge)
    };
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
    const connecting = url.startsWith('pglite') ? connect(url) : databaseBreaker.run(() => connect(url), databaseJudge);
    dbPromise = connecting.catch(err => {
      // The breaker has already said why it is open
      if (!(err instanceof CircuitOpenError)) logger.warn('[RegSonar History] Database unavailable', err);
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
  // Saved in id order, so two saves at once that share notices lock their
  // rows in the same order and cannot deadlock
  notices.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (let i = 0; i < notices.length; i += 50) {
    const batch = notices.slice(i, i + 50);
    const values: unknown[] = [];
    const rows = batch.map((n, j) => {
      values.push(n.id, n.regulator, n.regulatorId || null, n.jurisdictionCode, n.format, n.title, n.publishedAt || null, JSON.stringify(n));
      const k = j * 8;
      return `($${k + 1}, $${k + 2}, $${k + 3}, $${k + 4}, $${k + 5}, $${k + 6}, $${k + 7}, $${k + 8}::jsonb)`;
    });
    // With a source, the notices and their link to it are saved in one
    // statement: the notice_sources rows are made from the ids just saved
    if (sourceId) values.push(sourceId);
    await db.query(
      `${sourceId ? 'WITH saved AS (' : ''}INSERT INTO notices (id, regulator, regulator_id, jurisdiction_code, format, title, published_at, data)
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
         END || CASE
           WHEN notices.data ? 'noKeyPoints' AND NOT EXCLUDED.data ? 'keyPoints' AND NOT notices.data ? 'keyPoints'
             THEN jsonb_build_object('noKeyPoints', true)
           ELSE '{}'::jsonb
         END${sourceId ? `
       RETURNING id)
       INSERT INTO notice_sources (notice_id, source_id) SELECT id, $${values.length} FROM saved
       ON CONFLICT (notice_id, source_id) DO UPDATE SET last_seen_at = now()` : ''}`,
      values
    );
  }
}

// Merge fields into a stored notice in one statement, so what others saved
// meanwhile (its title, its sources) is kept rather than overwritten by an
// older copy. A date (publishedAt, with issuedTimeAgo) is set only when the
// notice still has none.
export async function patchNotice(db: Db, id: string, fields: Record<string, unknown>): Promise<void> {
  const { publishedAt, issuedTimeAgo, ...rest } = fields;
  await db.query(
    `UPDATE notices SET
       data = data || $2::jsonb || CASE WHEN published_at IS NULL AND $3::timestamptz IS NOT NULL THEN $4::jsonb ELSE '{}'::jsonb END,
       published_at = COALESCE(published_at, $3::timestamptz)
     WHERE id = $1`,
    [id, JSON.stringify(rest), publishedAt ?? null, JSON.stringify({ publishedAt, issuedTimeAgo })]
  );
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

// Background jobs (server/queue.ts)
export interface JobRow { id: string; kind: string; key: string; payload: any; attempts: number; maxAttempts: number }
// once: not added when a job of the same kind and key has already been done
export interface NewJob { kind: string; key: string; payload: unknown; maxAttempts: number; runAt?: Date; once?: boolean }

// Add jobs; one already waiting with the same kind and key is left as it is
export async function enqueueJobs(db: Db, jobs: NewJob[]): Promise<number> {
  if (jobs.length === 0) return 0;
  const rows = await db.query(
    `INSERT INTO jobs (kind, key, payload, max_attempts, run_at)
     SELECT kind, key, payload, max_attempts, COALESCE(run_at, now())
     FROM unnest($1::text[], $2::text[], $3::jsonb[], $4::int[], $5::timestamptz[], $6::boolean[]) AS j(kind, key, payload, max_attempts, run_at, once)
     WHERE NOT (j.once AND EXISTS (SELECT 1 FROM jobs d WHERE d.kind = j.kind AND d.key = j.key AND d.status = 'done'))
     ON CONFLICT (kind, key) WHERE status = 'queued' DO NOTHING
     RETURNING id`,
    [jobs.map(j => j.kind), jobs.map(j => j.key), jobs.map(j => JSON.stringify(j.payload)), jobs.map(j => j.maxAttempts),
      jobs.map(j => j.runAt?.toISOString() ?? null), jobs.map(j => j.once ?? false)]
  );
  return rows.length;
}

// Take up to `limit` jobs that are due and not taken, for leaseMs, in one
// statement: workers on other instances skip the rows taken here
export async function claimJobs(db: Db, limit: number, leaseMs: number, kinds?: string[]): Promise<JobRow[]> {
  const rows = await db.query(
    `UPDATE jobs SET locked_until = now() + make_interval(secs => $2::double precision / 1000), attempts = attempts + 1
     WHERE id IN (
       SELECT id FROM jobs
       WHERE status = 'queued' AND run_at <= now() AND (locked_until IS NULL OR locked_until <= now())
         AND ($3::text[] IS NULL OR kind = ANY($3::text[]))
       ORDER BY run_at, id LIMIT $1
       FOR UPDATE SKIP LOCKED)
     RETURNING id, kind, key, payload, attempts, max_attempts`,
    [limit, leaseMs, kinds ?? null]
  );
  return rows.map(r => ({ id: String(r.id), kind: r.kind, key: r.key, payload: r.payload, attempts: r.attempts, maxAttempts: r.max_attempts }));
}

export async function finishJob(db: Db, id: string): Promise<void> {
  await db.query(`UPDATE jobs SET status = 'done', finished_at = now(), locked_until = NULL WHERE id = $1`, [id]);
}

// A failed try: run again after retryInMs, or, with null, give up
export async function failJob(db: Db, id: string, error: string, retryInMs: number | null): Promise<void> {
  await db.query(
    `UPDATE jobs SET last_error = $2, locked_until = NULL,
       status = CASE WHEN $3::double precision IS NULL THEN 'failed' ELSE status END,
       finished_at = CASE WHEN $3::double precision IS NULL THEN now() ELSE finished_at END,
       run_at = CASE WHEN $3::double precision IS NULL THEN run_at ELSE now() + make_interval(secs => $3::double precision / 1000) END
     WHERE id = $1`,
    [id, error.slice(0, 500), retryInMs]
  );
}

// Finished jobs are kept a week, those that gave up a month
export async function pruneJobs(db: Db): Promise<void> {
  await db.query(`DELETE FROM jobs WHERE (status = 'done' AND finished_at < now() - interval '7 days')
    OR (status = 'failed' AND finished_at < now() - interval '30 days')`);
}

export async function jobCounts(db: Db): Promise<{ waiting: number; failed: number }> {
  const [row] = await db.query(`SELECT count(*) FILTER (WHERE status = 'queued') AS waiting,
    count(*) FILTER (WHERE status = 'failed' AND finished_at > now() - interval '7 days') AS failed FROM jobs`);
  return { waiting: Number(row?.waiting || 0), failed: Number(row?.failed || 0) };
}

// Changes to the history database, applied in order when the server connects.
// Each runs once: the database records the versions it has had in
// schema_migrations. To change the schema, add a migration at the end with the
// next version number. Never edit one that has run: a database that already
// has it will not run it again (a warning is logged if its text changes).
import { createHash } from 'crypto';
import { logger } from './logging.js';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// One connection to the database. A migration runs on a single connection,
// so that BEGIN, the lock and COMMIT apply to the same transaction.
export interface Session {
  // Statements without parameters, several at a time
  exec(sql: string): Promise<void>;
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'notices and scheduled checks',
    // The schema as it was before migrations (October 2026). Databases made
    // before then already have it, which is why it says IF NOT EXISTS.
    sql: `
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
CREATE TABLE IF NOT EXISTS scheduled_checks (
  id text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  status text NOT NULL,
  summary jsonb
);
CREATE INDEX IF NOT EXISTS scheduled_checks_started_idx ON scheduled_checks (started_at DESC);
`
  }
];

// Any fixed number, the same for every server instance
const MIGRATION_LOCK = 7_301_926_143;

const checksum = (sql: string) => createHash('sha256').update(sql).digest('hex');

// Apply the migrations the database has not had yet, all in one transaction:
// if one fails, none of this run's changes are kept and the error is thrown.
// Server instances that start together take turns, so each migration runs once.
// Returns the versions applied.
export async function migrate(
  session: Session,
  migrations: Migration[] = MIGRATIONS,
  warn: (message: string) => void = message => logger.warn(`[RegSonar History] ${message}`)
): Promise<number[]> {
  await session.exec('BEGIN');
  try {
    await session.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK]);
    await session.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version integer PRIMARY KEY,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const rows = await session.query<{ version: number; checksum: string }>('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(rows.map(r => [Number(r.version), r.checksum]));
    const known = new Set(migrations.map(m => m.version));
    const newer = [...applied.keys()].filter(v => !known.has(v));
    // An older deployment running against a database a newer one has changed
    if (newer.length) warn(`Database has migrations this code does not know: ${newer.sort((a, b) => a - b).join(', ')}`);

    const ran: number[] = [];
    for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
      const sum = checksum(m.sql);
      if (applied.has(m.version)) {
        if (applied.get(m.version) !== sum) warn(`Migration ${m.version} (${m.name}) was changed after it ran; the change is not applied. Add a new migration instead.`);
        continue;
      }
      await session.exec(m.sql);
      await session.query('INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)', [m.version, m.name, sum]);
      ran.push(m.version);
    }
    await session.exec('COMMIT');
    return ran;
  } catch (err) {
    await session.exec('ROLLBACK').catch(() => {});
    throw err;
  }
}

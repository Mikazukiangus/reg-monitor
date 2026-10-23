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
  // A query run after the migration, whose one row of counts is logged
  report?: string;
}

// One connection to the database. A migration runs on a single connection,
// so that BEGIN, the lock and COMMIT apply to the same transaction.
export interface Session {
  // Statements without parameters, several at a time
  exec(sql: string): Promise<void>;
  query<T = any>(sql: string, params?: unknown[]): Promise<T[]>;
}

// The id prefix of each source's notices that no other source uses, as of
// October 2026, for linking notices saved before migration 2 to the source
// that read them. Left out, because two or more sources use them: fedreg-
// (the Federal Register and its AI search), mas- (three MAS searches) and
// govcn- (China's AI and personal-information searches). Part of migration 2:
// don't edit.
export const SOURCE_PREFIXES_2026_10: [prefix: string, sourceId: string][] = [
  ['fca-', 'uk-fca-news'], ['pra-', 'uk-pra-publications'],
  ['hkma-pr-', 'hkma-press-releases'], ['hkma-cir-', 'hkma-circulars'], ['hkma-con-', 'hkma-consultations'],
  ['sfc-pr-', 'sfc-press-releases'], ['sfc-cir-', 'sfc-circulars'], ['sfc-con-', 'sfc-consultations'],
  ['hkex-', 'hkex-regulatory-announcements'], ['asic-', 'asic-media-releases'], ['jfsa-', 'jfsa-news'],
  ['esma-', 'esma-news'], ['fsb-', 'fsb-publications'],
  ['sgx-con-', 'sgx-regco-consultations'], ['sgx-disc-', 'sgx-regco-disciplinary-actions'], ['sgx-news-', 'sgx-regco-announcements'],
  ['asx-con-', 'asx-public-consultations'], ['jpx-', 'jpx-rule-revisions'], ['finra-', 'finra-notices'],
  ['bnm-', 'bnm-press-releases'], ['sc-my-', 'sc-malaysia-media-releases'], ['bis-', 'bis-media-releases'],
  ['ec-', 'ec-ai-news'], ['govuk-', 'uk-dsit-ai-security-institute'], ['ftc-', 'ftc-ai-privacy'],
  ['ca-gov-', 'california-governor-ai'], ['calprivacy-', 'calprivacy-news'], ['co-ag-', 'colorado-ag-ai'],
  ['msit-', 'korea-msit-ai'], ['cao-ai-', 'japan-cabinet-office-ai'], ['ico-', 'uk-ico-news'], ['edpb-', 'edpb-news'],
  ['pdpc-', 'singapore-pdpc-news'], ['jpdp-', 'malaysia-jpdp-announcements'], ['oaic-', 'australia-oaic-privacy'],
  ['ppc-', 'japan-ppc-news'], ['pipc-', 'korea-pipc-notices']
];

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
  },
  {
    version: 2,
    name: 'regulator ids and notice sources',
    // regulator_id: the regulator's stable id (shared/regulators.ts), made
    // from the name for notices already saved, as regulatorSlug does.
    // notice_sources: each source that has read a notice, with when it first
    // and last did; a notice can come from more than one. Notices already
    // saved are linked where their id prefix belongs to one source.
    sql: `
ALTER TABLE notices ADD COLUMN regulator_id text;
UPDATE notices SET regulator_id = NULLIF(trim(both '-' from regexp_replace(lower(regulator), '[^a-z0-9]+', '-', 'g')), '');
CREATE INDEX notices_regulator_id_idx ON notices (regulator_id);
CREATE TABLE notice_sources (
  notice_id text NOT NULL REFERENCES notices (id) ON DELETE CASCADE,
  source_id text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notice_id, source_id)
);
CREATE INDEX notice_sources_source_idx ON notice_sources (source_id);
INSERT INTO notice_sources (notice_id, source_id, first_seen_at, last_seen_at)
SELECT n.id, p.source_id, n.first_seen_at, n.last_seen_at
FROM notices n JOIN (VALUES
${SOURCE_PREFIXES_2026_10.map(([prefix, sourceId]) => `  ('${prefix}', '${sourceId}')`).join(',\n')}
) AS p (prefix, source_id) ON starts_with(n.id, p.prefix);
`,
    report: `SELECT
  (SELECT count(*) FROM notices)::int AS notices,
  (SELECT count(*) FROM notices WHERE regulator_id IS NOT NULL)::int AS "with regulator id",
  (SELECT count(DISTINCT notice_id) FROM notice_sources)::int AS "linked to a source",
  (SELECT count(*) FROM notices n WHERE NOT EXISTS (SELECT 1 FROM notice_sources s WHERE s.notice_id = n.id))::int AS "not linked"`
  },
  {
    version: 3,
    name: 'consultation links',
    // Each consultation and outcome (conclusions, a response, a policy
    // statement) matched by shared/related.ts, with the share of topic words
    // they have in common. Filled when notices are saved, and rebuilt by each
    // scheduled check; deleted with either notice.
    sql: `
CREATE TABLE notice_links (
  consultation_id text NOT NULL REFERENCES notices (id) ON DELETE CASCADE,
  conclusion_id text NOT NULL REFERENCES notices (id) ON DELETE CASCADE,
  score real NOT NULL,
  found_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consultation_id, conclusion_id)
);
CREATE INDEX notice_links_conclusion_idx ON notice_links (conclusion_id);
`
  },
  {
    version: 4,
    name: 'notice dates',
    // Every date a notice has, for queries in SQL: those its regulator
    // publishes with it and those its document states (server/dates.ts),
    // with the sentence that states it. Filled when notices are saved, and
    // rebuilt by each scheduled check; empty until the first. Which date a
    // notice shows depends on today, so it is worked out when read
    // (shared/keyDate.ts; sql/upcoming-deadlines.sql in SQL).
    sql: `
CREATE TABLE notice_dates (
  notice_id text NOT NULL REFERENCES notices (id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('regulator', 'document')),
  kind text NOT NULL CHECK (kind IN ('closes', 'takesEffect', 'complyBy')),
  date date NOT NULL,
  -- A closing date stated generally ("The consultation closes on ..."),
  -- which belongs to the notice only if it is a consultation
  general boolean NOT NULL DEFAULT false,
  quote text,
  PRIMARY KEY (notice_id, source, kind, date)
);
CREATE INDEX notice_dates_date_idx ON notice_dates (date);
`
  },
  {
    version: 5,
    name: 'indexes for undated notices and the last completed check',
    // Partial indexes for two queries in server/db.ts that otherwise read more
    // as the history grows: the scheduled check's undated notices, oldest seen
    // first (undatedNotices), and the last completed check (scheduledCheckStatus).
    // Each holds only the rows its query asks for.
    sql: `
CREATE INDEX notices_undated_idx ON notices (last_seen_at) WHERE published_at IS NULL;
CREATE INDEX scheduled_checks_completed_idx ON scheduled_checks (completed_at DESC) WHERE status = 'completed';
`
  },
  {
    version: 6,
    name: 'background jobs',
    // Work done after a request has been answered (server/queue.ts): reading a
    // notice's document for key points, sending the digest. A job waiting to
    // run is listed once per kind and key; a worker takes it for a while
    // (locked_until), so a worker that stops part way leaves it to another.
    sql: `
CREATE TABLE jobs (
  id bigserial PRIMARY KEY,
  kind text NOT NULL,
  key text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE UNIQUE INDEX jobs_waiting_key_idx ON jobs (kind, key) WHERE status = 'queued';
CREATE INDEX jobs_due_idx ON jobs (run_at) WHERE status = 'queued';
`
  },
  {
    version: 7,
    name: 'shared cache',
    // What one server instance read (each source's list, the endpoint
    // checks), for the other instances to use until it is too old
    // (server/shared-cache.ts)
    sql: `
CREATE TABLE cache (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  stored_at timestamptz NOT NULL DEFAULT now()
);
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
  warn: (message: string) => void = message => logger.warn(`[RegSonar History] ${message}`),
  info: (message: string) => void = message => logger.info(`[RegSonar History] ${message}`)
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
      if (m.report) {
        const [counts] = await session.query(m.report);
        info(`Migration ${m.version} (${m.name}): ${Object.entries(counts ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}`);
      }
    }
    await session.exec('COMMIT');
    return ran;
  } catch (err) {
    await session.exec('ROLLBACK').catch(() => {});
    throw err;
  }
}

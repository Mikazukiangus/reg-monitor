// The history database's migrations (server/migrations.ts), run on PGlite
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { MIGRATIONS, SOURCE_PREFIXES_2026_10, migrate, type Migration, type Session } from '../server/migrations.ts';
import { REGULATORS, regulatorIdOf } from '../shared/regulators.ts';

const session = (lite: PGlite): Session => ({
  exec: async sql => { await lite.exec(sql); },
  query: async (sql, params) => (await lite.query(sql, params as any[])).rows as any[]
});
const tables = async (lite: PGlite) =>
  (await lite.query<{ t: string }>(`SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`)).rows.map(r => r.t);
const versions = async (lite: PGlite) =>
  (await lite.query<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version')).rows.map(r => r.version);
const quiet = () => {};

test('the migrations are numbered 1, 2, 3 ... in order, with names and SQL', () => {
  assert.deepEqual(MIGRATIONS.map(m => m.version), MIGRATIONS.map((_, i) => i + 1));
  for (const m of MIGRATIONS) assert.ok(m.name.trim() && m.sql.trim(), `migration ${m.version}`);
});

test('a new database gets every migration once', async () => {
  const lite = new PGlite();
  assert.deepEqual(await migrate(session(lite), MIGRATIONS, quiet, quiet), MIGRATIONS.map(m => m.version));
  assert.deepEqual(await tables(lite), ['notice_dates', 'notice_links', 'notice_sources', 'notices', 'scheduled_checks', 'schema_migrations']);
  assert.deepEqual(await migrate(session(lite), MIGRATIONS, quiet, quiet), []);
  assert.deepEqual(await versions(lite), MIGRATIONS.map(m => m.version));
});

test('a database made before migrations keeps its notices and is marked as having migration 1', async () => {
  const lite = new PGlite();
  // The schema the server applied on every start before migrations
  await lite.exec(MIGRATIONS[0].sql);
  await lite.query(`INSERT INTO notices (id, regulator, jurisdiction_code, format, title, data) VALUES ('mas-1', 'MAS', 'SG', 'Circulars', 'Circular on capital', '{"summary":"Capital rules"}')`);
  assert.deepEqual(await migrate(session(lite), MIGRATIONS, quiet, quiet), MIGRATIONS.map(m => m.version));
  const rows = (await lite.query<{ id: string }>(`SELECT id FROM notices WHERE search @@ websearch_to_tsquery('english', 'capital')`)).rows;
  assert.deepEqual(rows.map(r => r.id), ['mas-1']);
});

test('a later migration is applied once, after the earlier ones', async () => {
  const lite = new PGlite();
  await migrate(session(lite), MIGRATIONS, quiet, quiet);
  const next: Migration = { version: MIGRATIONS.length + 1, name: 'source column', sql: 'ALTER TABLE notices ADD COLUMN source text;' };
  assert.deepEqual(await migrate(session(lite), [...MIGRATIONS, next], quiet, quiet), [next.version]);
  assert.deepEqual(await migrate(session(lite), [...MIGRATIONS, next], quiet, quiet), []);
  const columns = (await lite.query<{ c: string }>(`SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'notices'`)).rows.map(r => r.c);
  assert.ok(columns.includes('source'));
});

test('when a migration fails, nothing from that run is kept, and it runs again next time', async () => {
  const lite = new PGlite();
  await migrate(session(lite), MIGRATIONS, quiet, quiet);
  const v = MIGRATIONS.length;
  const good: Migration = { version: v + 1, name: 'source column', sql: 'ALTER TABLE notices ADD COLUMN source text;' };
  const bad: Migration = { version: v + 2, name: 'broken', sql: 'ALTER TABLE no_such_table ADD COLUMN x text;' };
  await assert.rejects(migrate(session(lite), [...MIGRATIONS, good, bad], quiet, quiet), /no_such_table/);
  assert.deepEqual(await versions(lite), MIGRATIONS.map(m => m.version));
  const columns = async () => (await lite.query<{ c: string }>(`SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'notices'`)).rows.map(r => r.c);
  assert.ok(!(await columns()).includes('source'));
  // The connection is usable afterwards, and the fixed migration runs
  const fixed: Migration = { ...bad, sql: 'CREATE TABLE regulators (id text PRIMARY KEY);' };
  assert.deepEqual(await migrate(session(lite), [...MIGRATIONS, good, fixed], quiet, quiet), [v + 1, v + 2]);
  assert.ok((await columns()).includes('source'));
});

test('a migration edited after it ran is not run again, and a warning says so', async () => {
  const lite = new PGlite();
  await migrate(session(lite), MIGRATIONS, quiet, quiet);
  const warnings: string[] = [];
  const edited = MIGRATIONS.map((m, i) => (i === 0 ? { ...m, sql: m.sql + '\nCREATE TABLE extra (id text);' } : m));
  assert.deepEqual(await migrate(session(lite), edited, w => warnings.push(w)), []);
  assert.ok(!(await tables(lite)).includes('extra'));
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Migration 1 \(notices and scheduled checks\) was changed after it ran/);
});

test('a database with migrations newer than the code is used as it is, with a warning', async () => {
  const lite = new PGlite();
  const next: Migration = { version: MIGRATIONS.length + 1, name: 'later', sql: 'CREATE TABLE later (id text);' };
  await migrate(session(lite), [...MIGRATIONS, next], quiet, quiet);
  const warnings: string[] = [];
  assert.deepEqual(await migrate(session(lite), MIGRATIONS, w => warnings.push(w)), []);
  assert.deepEqual(warnings, [`Database has migrations this code does not know: ${next.version}`]);
});

// A database as production had it before migration 2: migration 1 applied,
// and notices saved without regulator ids or sources
async function beforeMigration2(rows: { id: string; regulator: string }[]) {
  const lite = new PGlite();
  await migrate(session(lite), MIGRATIONS.slice(0, 1), quiet, quiet);
  for (const r of rows) {
    await lite.query(
      `INSERT INTO notices (id, regulator, jurisdiction_code, format, title, data, first_seen_at, last_seen_at)
       VALUES ($1, $2, 'SG', 'Circulars', 'A notice', '{}', '2026-10-01T00:00:00Z', '2026-10-20T00:00:00Z')`,
      [r.id, r.regulator]
    );
  }
  return lite;
}

test('migration 2 gives saved notices the regulator id the server gives them', async () => {
  // Every listed regulator, one not listed, and a Chinese issuer the gov.cn source does not know
  const names = [...REGULATORS.map(r => r.name), 'US Federal Maritime Commission', '国家某局'];
  const lite = await beforeMigration2(names.map((regulator, i) => ({ id: `n-${i}`, regulator })));
  await migrate(session(lite), MIGRATIONS, quiet, quiet);
  const rows = (await lite.query<{ regulator: string; regulator_id: string | null }>('SELECT regulator, regulator_id FROM notices')).rows;
  assert.equal(rows.length, names.length);
  for (const r of rows) assert.equal(r.regulator_id, regulatorIdOf(r.regulator) ?? null, r.regulator);
  assert.equal(rows.find(r => r.regulator === 'US Federal Maritime Commission')?.regulator_id, 'us-federal-maritime-commission');
  assert.equal(rows.find(r => r.regulator === '国家某局')?.regulator_id, null);
});

test('migration 2 links saved notices to their source where only one source uses the id prefix', async () => {
  const linked = SOURCE_PREFIXES_2026_10.map(([prefix, sourceId], i) => ({ id: `${prefix}doc-${i}`, regulator: 'MAS', sourceId }));
  // Prefixes two or more sources use, and a source removed before October 2026
  const unlinked = ['fedreg-2026-12345', 'mas-mas-media-release', 'govcn-content_123', 'hkma-liquidity-2026-09-30'];
  const lite = await beforeMigration2([...linked, ...unlinked.map(id => ({ id, regulator: 'MAS' }))]);
  const reports: string[] = [];
  await migrate(session(lite), MIGRATIONS, quiet, r => reports.push(r));
  const rows = (await lite.query<{ notice_id: string; source_id: string; first_seen_at: Date; last_seen_at: Date }>(
    'SELECT notice_id, source_id, first_seen_at, last_seen_at FROM notice_sources ORDER BY notice_id'
  )).rows;
  assert.deepEqual(rows.map(r => [r.notice_id, r.source_id]), linked.map(n => [n.id, n.sourceId]).sort((a, b) => a[0].localeCompare(b[0])));
  // When the notice was first and last seen, from the notice itself
  assert.ok(rows.every(r => r.first_seen_at.toISOString() === '2026-10-01T00:00:00.000Z' && r.last_seen_at.toISOString() === '2026-10-20T00:00:00.000Z'));
  assert.deepEqual(reports, [
    `Migration 2 (regulator ids and notice sources): notices ${linked.length + unlinked.length}, with regulator id ${linked.length + unlinked.length}, linked to a source ${linked.length}, not linked ${unlinked.length}`
  ]);
});

test('a notice\'s sources go when the notice does', async () => {
  const lite = await beforeMigration2([{ id: 'esma-report', regulator: 'ESMA' }]);
  await migrate(session(lite), MIGRATIONS, quiet, quiet);
  await lite.query(`DELETE FROM notices WHERE id = 'esma-report'`);
  assert.equal((await lite.query('SELECT * FROM notice_sources')).rows.length, 0);
});

test('a consultation link goes when either notice does', async () => {
  const lite = await beforeMigration2([{ id: 'mas-cp', regulator: 'MAS' }, { id: 'mas-response', regulator: 'MAS' }, { id: 'mas-other', regulator: 'MAS' }]);
  await migrate(session(lite), MIGRATIONS, quiet, quiet);
  await lite.query(`INSERT INTO notice_links (consultation_id, conclusion_id, score) VALUES ('mas-cp', 'mas-response', 1), ('mas-other', 'mas-response', 0.7)`);
  await lite.query(`DELETE FROM notices WHERE id = 'mas-cp'`);
  assert.deepEqual((await lite.query('SELECT consultation_id FROM notice_links')).rows, [{ consultation_id: 'mas-other' }]);
  await lite.query(`DELETE FROM notices WHERE id = 'mas-response'`);
  assert.equal((await lite.query('SELECT * FROM notice_links')).rows.length, 0);
});

test('a notice\'s dates go when the notice does, and only known kinds and sources are stored', async () => {
  const lite = await beforeMigration2([{ id: 'mas-cp', regulator: 'MAS' }]);
  await migrate(session(lite), MIGRATIONS, quiet, quiet);
  await lite.query(`INSERT INTO notice_dates (notice_id, source, kind, date) VALUES ('mas-cp', 'regulator', 'closes', '2026-12-01')`);
  await assert.rejects(lite.query(`INSERT INTO notice_dates (notice_id, source, kind, date) VALUES ('mas-cp', 'regulator', 'effective', '2026-12-01')`));
  await assert.rejects(lite.query(`INSERT INTO notice_dates (notice_id, source, kind, date) VALUES ('mas-cp', 'feed', 'closes', '2026-12-02')`));
  await lite.query(`DELETE FROM notices WHERE id = 'mas-cp'`);
  assert.equal((await lite.query('SELECT * FROM notice_dates')).rows.length, 0);
});

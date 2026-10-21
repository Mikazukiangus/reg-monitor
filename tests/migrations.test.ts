// The history database's migrations (server/migrations.ts), run on PGlite
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { MIGRATIONS, migrate, type Migration, type Session } from '../server/migrations.ts';

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
  assert.deepEqual(await migrate(session(lite), MIGRATIONS, quiet), MIGRATIONS.map(m => m.version));
  assert.deepEqual(await tables(lite), ['notices', 'scheduled_checks', 'schema_migrations']);
  assert.deepEqual(await migrate(session(lite), MIGRATIONS, quiet), []);
  assert.deepEqual(await versions(lite), MIGRATIONS.map(m => m.version));
});

test('a database made before migrations keeps its notices and is marked as having migration 1', async () => {
  const lite = new PGlite();
  // The schema the server applied on every start before migrations
  await lite.exec(MIGRATIONS[0].sql);
  await lite.query(`INSERT INTO notices (id, regulator, jurisdiction_code, format, title, data) VALUES ('mas-1', 'MAS', 'SG', 'Circulars', 'Circular on capital', '{"summary":"Capital rules"}')`);
  assert.deepEqual(await migrate(session(lite), MIGRATIONS, quiet), MIGRATIONS.map(m => m.version));
  const rows = (await lite.query<{ id: string }>(`SELECT id FROM notices WHERE search @@ websearch_to_tsquery('english', 'capital')`)).rows;
  assert.deepEqual(rows.map(r => r.id), ['mas-1']);
});

test('a later migration is applied once, after the earlier ones', async () => {
  const lite = new PGlite();
  await migrate(session(lite), MIGRATIONS, quiet);
  const next: Migration = { version: MIGRATIONS.length + 1, name: 'source column', sql: 'ALTER TABLE notices ADD COLUMN source text;' };
  assert.deepEqual(await migrate(session(lite), [...MIGRATIONS, next], quiet), [next.version]);
  assert.deepEqual(await migrate(session(lite), [...MIGRATIONS, next], quiet), []);
  const columns = (await lite.query<{ c: string }>(`SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'notices'`)).rows.map(r => r.c);
  assert.ok(columns.includes('source'));
});

test('when a migration fails, nothing from that run is kept, and it runs again next time', async () => {
  const lite = new PGlite();
  await migrate(session(lite), MIGRATIONS, quiet);
  const v = MIGRATIONS.length;
  const good: Migration = { version: v + 1, name: 'source column', sql: 'ALTER TABLE notices ADD COLUMN source text;' };
  const bad: Migration = { version: v + 2, name: 'broken', sql: 'ALTER TABLE no_such_table ADD COLUMN x text;' };
  await assert.rejects(migrate(session(lite), [...MIGRATIONS, good, bad], quiet), /no_such_table/);
  assert.deepEqual(await versions(lite), MIGRATIONS.map(m => m.version));
  const columns = async () => (await lite.query<{ c: string }>(`SELECT column_name AS c FROM information_schema.columns WHERE table_name = 'notices'`)).rows.map(r => r.c);
  assert.ok(!(await columns()).includes('source'));
  // The connection is usable afterwards, and the fixed migration runs
  const fixed: Migration = { ...bad, sql: 'CREATE TABLE regulators (id text PRIMARY KEY);' };
  assert.deepEqual(await migrate(session(lite), [...MIGRATIONS, good, fixed], quiet), [v + 1, v + 2]);
  assert.ok((await columns()).includes('source'));
});

test('a migration edited after it ran is not run again, and a warning says so', async () => {
  const lite = new PGlite();
  await migrate(session(lite), MIGRATIONS, quiet);
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
  await migrate(session(lite), [...MIGRATIONS, next], quiet);
  const warnings: string[] = [];
  assert.deepEqual(await migrate(session(lite), MIGRATIONS, w => warnings.push(w)), []);
  assert.deepEqual(warnings, [`Database has migrations this code does not know: ${next.version}`]);
});

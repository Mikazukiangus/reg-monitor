// Saving notices records each source that read them (notice_sources) and the
// regulator's id, in an in-memory history database
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite';
const { openStore } = await import('../server/store.ts');
const { getDb } = await import('../server/db.ts');
const { tagNotice } = await import('../server/notice.ts');
type NormalizedNotice = import('../server/notice.ts').NormalizedNotice;

const notice = (id: string, regulator = 'US SEC') => tagNotice({
  id, ref: id, title: `Rule ${id} on swap reporting`, regulator, jurisdiction: 'UNITED STATES', jurisdictionCode: 'US',
  type: 'RULE', typeColorClass: { bg: '', text: '' }, impactScore: 5, issuedTimeAgo: '', tags: [], sector: 'Banking & Prudential',
  format: 'Circulars', severity: 'info', dossierUrl: `https://www.federalregister.gov/d/${id}`, publishedAt: '2026-10-01T00:00:00.000Z'
} as NormalizedNotice);

const links = async (id: string) => (await (await getDb())!.query(
  'SELECT source_id, first_seen_at, last_seen_at FROM notice_sources WHERE notice_id = $1 ORDER BY source_id', [id]
)) as { source_id: string; first_seen_at: Date; last_seen_at: Date }[];

test('a notice is linked to each source that reads it, once', async () => {
  const store = (await openStore())!;
  await store.save([notice('fedreg-2026-1')], 'us-federal-register');
  const [first] = await links('fedreg-2026-1');
  assert.equal(first.source_id, 'us-federal-register');
  // The AI search reads the same document under the same id
  await store.save([notice('fedreg-2026-1')], 'us-federal-register-ai');
  // Read again by the first source: the same link, seen later
  await store.save([notice('fedreg-2026-1')], 'us-federal-register');
  const after = await links('fedreg-2026-1');
  assert.deepEqual(after.map(l => l.source_id), ['us-federal-register', 'us-federal-register-ai']);
  assert.equal(after[0].first_seen_at.getTime(), first.first_seen_at.getTime());
  assert.ok(after[0].last_seen_at.getTime() >= first.last_seen_at.getTime());
});

test('a stored copy saved again without a source keeps its links', async () => {
  const store = (await openStore())!;
  await store.save([notice('fedreg-2026-2')], 'us-federal-register');
  await store.save([notice('fedreg-2026-2')]);
  assert.deepEqual((await links('fedreg-2026-2')).map(l => l.source_id), ['us-federal-register']);
});

test('a saved notice records its regulator id', async () => {
  const store = (await openStore())!;
  await store.save([notice('fedreg-2026-3', 'US Commerce (BIS)'), notice('bis-press-1', 'BIS')], 'us-federal-register-ai');
  const rows = await (await getDb())!.query(`SELECT id, regulator_id FROM notices WHERE id IN ('fedreg-2026-3', 'bis-press-1') ORDER BY id`);
  // Two bodies the alert rules' name matching can confuse are kept apart
  assert.deepEqual(rows, [{ id: 'bis-press-1', regulator_id: 'bis' }, { id: 'fedreg-2026-3', regulator_id: 'us-commerce-bis' }]);
  assert.equal((await store.byIds(['fedreg-2026-3'])).get('fedreg-2026-3')?.regulatorId, 'us-commerce-bis');
});

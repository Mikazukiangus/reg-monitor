// The notice store (server/store.ts), and services given a store of their own
// instead of the database
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite';
// A small cap, so the test below can fill it with live notices
process.env.ARCHIVE_FEED_LIMIT = '2';
const { openStore, toStored } = await import('../server/store.ts');
const { withHistory } = await import('../server/history.ts');
const { enrichWithKeyPoints } = await import('../server/enrich.ts');
type NoticeStore = import('../server/store.ts').NoticeStore;
type StoredNotice = import('../server/store.ts').StoredNotice;
type NormalizedNotice = import('../server/notice.ts').NormalizedNotice;

const notice = (id: string, fields: Partial<NormalizedNotice> = {}): NormalizedNotice => ({
  id, ref: id, title: `Circular ${id} on capital requirements`, regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
  type: 'CIRCULAR', typeColorClass: { bg: '', text: '' }, impactScore: 5, issuedTimeAgo: '', tags: [],
  sector: 'Banking & Prudential', sectors: ['Banking & Prudential'], format: 'Circulars', severity: 'info',
  dossierUrl: `https://www.mas.gov.sg/${id}`, publishedAt: '2026-10-10T02:00:00.000Z', ...fields
} as NormalizedNotice);

// A store held in memory; each method can be replaced
function memoryStore(rows: StoredNotice[], overrides: Partial<NoticeStore> = {}): NoticeStore {
  const byId = new Map(rows.map(r => [r.id, r]));
  const store: NoticeStore = {
    save: async notices => notices.forEach(n => byId.set(n.id, toStored(n))),
    patch: async (id, fields) => { if (byId.has(id)) byId.set(id, { ...byId.get(id)!, ...fields }); },
    exclusive: (_lock, fn) => fn(store),
    byIds: async ids => new Map(ids.flatMap(id => (byId.has(id) ? [[id, byId.get(id)!] as const] : []))),
    recent: async () => [...byId.values()],
    search: async () => [],
    linkCandidates: async () => [],
    addLinks: async () => {},
    replaceLinks: async () => {},
    links: async () => ({ links: [], notices: [] }),
    dateFields: async () => [...byId.values()],
    replaceDates: async () => {},
    undated: async () => [],
    stats: async () => ({ count: byId.size, since: '2026-09-01T00:00:00.000Z' }),
    saveCheck: async () => {},
    checkStatus: async () => ({ latest: null, lastCompletedAt: null, dateBackfill: { pending: 0, unresolved: 0 } }),
    ...overrides
  };
  return store;
}

test('a stored notice leaves out what is worked out when it is read back', () => {
  const stored = toStored({ ...notice('a'), archived: true, related: [{ id: 'b', title: 'B', relation: 'conclusion' } as any] });
  assert.equal('archived' in stored, false);
  assert.equal('related' in stored, false);
  assert.equal(stored.title, 'Circular a on capital requirements');
});

test('the feed adds stored notices it does not already have, marked as from the history', async () => {
  const live = [notice('live')];
  const { notices, archive } = await withHistory(live, memoryStore([toStored(notice('live')), toStored(notice('old', { publishedAt: '2026-10-01T02:00:00.000Z' }))]));
  assert.deepEqual(notices.map(n => [n.id, !!n.archived]), [['live', false], ['old', true]]);
  assert.deepEqual(archive, { enabled: true, count: 2, since: '2026-09-01T00:00:00.000Z' });
});

test('a history that is set up but unreachable, or that fails, is reported and the feed is the live notices', async () => {
  const live = [notice('live')];
  // DATABASE_URL is set in this test, so no store means it could not be reached
  assert.deepEqual(await withHistory(live, null), { notices: live, archive: { enabled: true, error: 'The history database could not be reached' } });
  const failing = memoryStore([], { recent: async () => { throw new Error('connection reset'); } });
  const { notices, archive } = await withHistory(live, failing);
  assert.deepEqual(notices.map(n => n.id), ['live']);
  assert.deepEqual(archive, { enabled: true, error: 'The history database could not be read' });
});

test('key points already stored are used without reading the document again', async () => {
  const keyPoints = { points: ['Banks must hold more capital against crypto exposures.'], facts: [], refs: [], method: 'extractive' as const, published: '2026-10-10' };
  const store = memoryStore([{ ...toStored(notice('kp')), keyPoints } as StoredNotice]);
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async () => { fetched++; throw new Error('not expected'); }) as typeof fetch;
  try {
    const [enriched] = await enrichWithKeyPoints([notice('kp')], undefined, store);
    assert.deepEqual(enriched.keyPoints?.points, keyPoints.points);
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('the database store saves and reads back the same notice, without the read-back fields', async () => {
  const store = (await openStore())!;
  assert.ok(store);
  assert.equal(await openStore(), store, 'one store per connection');
  await store.save([{ ...notice('round-trip', { keyPoints: { points: ['Quoted.'], facts: [], refs: [] } as any }), archived: true }]);
  const back = (await store.byIds(['round-trip', 'missing'])).get('round-trip');
  assert.equal(back?.title, 'Circular round-trip on capital requirements');
  assert.deepEqual(back?.keyPoints?.points, ['Quoted.']);
  assert.equal(back && 'archived' in back, false);
  assert.deepEqual((await store.search('capital', 5)).map(n => n.id), ['round-trip']);
  assert.equal((await store.stats()).count, 1);

  // A new server instance reuses them: enrichment with the default store
  // finds them in the database instead of reading the document again
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error('not expected'); }) as typeof fetch;
  try {
    const [enriched] = await enrichWithKeyPoints([notice('round-trip')]);
    assert.deepEqual(enriched.keyPoints?.points, ['Quoted.']);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('only server/store.ts reads the database module', async () => {
  const { readFileSync, readdirSync } = await import('node:fs');
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? files(`${dir}/${e.name}`) : e.name.endsWith('.ts') ? [`${dir}/${e.name}`] : []));
  const importers = [...files('server'), 'server.ts'].filter(f => /from '(\.\.\/)+db\.js'|from '\.\/db\.js'/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(importers, ['server/store.ts']);
});

test('notices also in the live feed do not use up the history limit', async () => {
  const store = (await openStore())!;
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
  // Two live notices, newer than the history one: before, they took both of
  // the limit's two places and the history notice was left out. (The earlier
  // test's notice is in the database too, and older than these.)
  const live = [notice('cap-live-1', { publishedAt: hoursAgo(1) }), notice('cap-live-2', { publishedAt: hoursAgo(2) })];
  await store.save([...live, notice('cap-history', { publishedAt: hoursAgo(3) })]);
  assert.deepEqual((await store.recent(30, 1, live.map(n => n.id))).map(n => n.id), ['cap-history']);
  const { notices } = await withHistory(live, store);
  assert.deepEqual(notices.slice(0, 3).map(n => [n.id, !!n.archived]), [['cap-live-1', false], ['cap-live-2', false], ['cap-history', true]]);
});

// The shared cache (server/shared-cache.ts): what one server instance read
// (a source's list, the endpoint checks) is used by the others until it is
// too old, and never by another deployment. Each "instance" is a fresh copy
// of the module that keeps the per-instance copies (an import with a query).
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite';
process.env.VERCEL_DEPLOYMENT_ID = 'dpl_test';
const { getDb } = await import('../server/db.ts');
const { ENDPOINTS } = await import('../server/sources/index.ts');
type NormalizedNotice = import('../server/notice.ts').NormalizedNotice;

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const notice = (id: string): NormalizedNotice => ({
  id, ref: id, title: `Circular ${id}`, regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
  type: 'CIRCULAR', typeColorClass: { bg: '', text: '' }, impactScore: 5, issuedTimeAgo: '', tags: [],
  sector: 'Banking & Prudential', sectors: ['Banking & Prudential'], format: 'Circulars', severity: 'info',
  publishedAt: '2026-10-20T02:00:00.000Z'
} as NormalizedNotice);

const instance = (name: string) => import(`../server/ingest.ts?instance=${name}`) as Promise<typeof import('../server/ingest.ts')>;
const healthInstance = (name: string) => import(`../server/health.ts?instance=${name}`) as Promise<typeof import('../server/health.ts')>;

test('a source read by one instance is used by the others until it is too old', async () => {
  let reads = 0;
  const source = { id: 'shared-src', name: 'Shared source', fetch: async () => { reads++; return [notice(`shared-${reads}`)]; } } as any;
  const [a] = await (await instance('a')).refreshSources([source]);
  assert.equal(reads, 1);
  // A new instance takes it from the cache: no read, the same notices and time
  const [b] = await (await instance('b')).refreshSources([source]);
  assert.equal(reads, 1);
  assert.deepEqual(b.notices.map(n => n.id), ['shared-1']);
  assert.equal(b.lastSuccessAt, a.lastSuccessAt);
  // Older than SOURCE_TTL_MS (10 minutes): read again, and shared again
  await (await getDb())!.query(`UPDATE cache SET stored_at = now() - interval '11 minutes' WHERE key = 'dpl_test/source/shared-src'`);
  const [c] = await (await instance('c')).refreshSources([source]);
  assert.equal(reads, 2);
  assert.deepEqual(c.notices.map(n => n.id), ['shared-2']);
  const [d] = await (await instance('d')).refreshSources([source]);
  assert.equal(reads, 2);
  assert.deepEqual(d.notices.map(n => n.id), ['shared-2']);
});

test('a failed read is shared too, so other instances do not ask the site again at once', async () => {
  let reads = 0;
  const source = { id: 'failing-src', name: 'Failing source', fetch: async () => { reads++; throw new Error('boom'); } } as any;
  const [a] = await (await instance('e')).refreshSources([source]);
  const [b] = await (await instance('f')).refreshSources([source]);
  assert.equal(reads, 1);
  assert.equal(b.error, a.error);
});

test("another deployment's entries are not used", async () => {
  await (await getDb())!.query(
    `INSERT INTO cache (key, value) VALUES ('dpl_old/source/new-code-src', $1::jsonb)`,
    [JSON.stringify({ notices: [notice('old-parse')], lastSuccessAt: new Date().toISOString() })]
  );
  let reads = 0;
  const source = { id: 'new-code-src', name: 'New code source', fetch: async () => { reads++; return [notice('new-parse')]; } } as any;
  const [state] = await (await instance('g')).refreshSources([source]);
  assert.equal(reads, 1);
  assert.deepEqual(state.notices.map(n => n.id), ['new-parse']);
});

test('endpoint checks made by one instance are used by the others, with the time they were made', async () => {
  let asked = 0;
  globalThis.fetch = (async () => {
    asked++;
    return new Response('<html><title>Notices</title></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;
  const a = await healthInstance('a');
  const first = await a.getEndpointsHealth();
  assert.equal(asked, ENDPOINTS.length);
  const b = await healthInstance('b');
  assert.deepEqual(await b.getEndpointsHealth(), first);
  assert.equal(asked, ENDPOINTS.length, 'not asked again');
  assert.equal(await b.endpointsCheckedAt(), await a.endpointsCheckedAt());
});

test('the endpoint status is kept by the CDN for 2 minutes and says when the checks were made', async () => {
  globalThis.fetch = (async (url: string, init?: RequestInit) => String(url).startsWith('http://127.0.0.1')
    ? realFetch(url, init)
    : new Response('<html><title>Notices</title></html>', { status: 200 })) as typeof fetch;
  const { createApp } = await import('../server.ts');
  const { endpointsCheckedAt } = await import('../server/health.ts');
  const server = createApp().listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const reply = await fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/feeds/status`);
    assert.equal(reply.headers.get('cache-control'), 'public, s-maxage=120, stale-while-revalidate=600');
    const body = await reply.json();
    assert.equal(body.totalEndpoints, ENDPOINTS.length);
    assert.equal(body.lastChecked, await endpointsCheckedAt());
  } finally {
    server.close();
  }
});

test('entries a day old are removed', async () => {
  const db = (await getDb())!;
  await db.query(`INSERT INTO cache (key, value, stored_at) VALUES ('dpl_old/health', '[]'::jsonb, now() - interval '25 hours')`);
  const { openStore } = await import('../server/store.ts');
  await (await openStore())!.pruneCache();
  assert.deepEqual((await db.query(`SELECT key FROM cache WHERE key = 'dpl_old/health'`)), []);
});

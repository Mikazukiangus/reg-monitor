// Rate limits counted across server instances (server/rate-limits.ts, the
// rate_limits table): two copies of the middleware stand for two instances
// with their own memory and one history database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'net';

process.env.DATABASE_URL = 'pglite';
const { apiRateLimits, LIMITS } = await import('../server/rate-limits.ts');
const { openStore } = await import('../server/store.ts');
const { getDb } = await import('../server/db.ts');
type NoticeStore = import('../server/store.ts').NoticeStore;

const limits = (name: string) => [
  // An hour, so the window does not end part way through a test
  { name, applies: (_m: string, path: string) => path === '/api/costly', limit: 3, windowMs: 3_600_000, shared: true, message: (wait: number) => `Wait ${wait}s` },
  { name: `${name}-rest`, applies: () => true, limit: 100, windowMs: 60_000, message: (wait: number) => `Wait ${wait}s` }
];

// An app with its own copy of the middleware: one instance
function instance(name: string, store: () => Promise<NoticeStore | null> = openStore) {
  const app = express();
  app.use('/api', apiRateLimits(limits(name), store));
  app.all('/api/:route', (_req, res) => res.json({ ok: true }));
  const server = app.listen(0, '127.0.0.1');
  return {
    ready: new Promise(resolve => server.once('listening', resolve)),
    get: (route: string) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/${route}`),
    close: () => server.close()
  };
}

test('the tighter limits are counted across instances', () => {
  assert.deepEqual(LIMITS.filter(l => l.shared).map(l => l.name), ['refresh', 'scheduled', 'search', 'by-id', 'status']);
});

test('a visitor spreading requests over instances is held to one limit, and the database never holds the address', async () => {
  const a = instance('spread'), b = instance('spread');
  await Promise.all([a.ready, b.ready]);
  try {
    // 3 allowed in all: 2 on one instance and 1 on the other, each under its own memory limit
    assert.equal((await a.get('costly')).status, 200);
    assert.equal((await b.get('costly')).status, 200);
    assert.equal((await a.get('costly')).status, 200);
    const limited = await b.get('costly');
    assert.equal(limited.status, 429);
    const wait = Number(limited.headers.get('retry-after'));
    assert.ok(wait >= 1 && wait <= 3600, `Retry-After ${wait}`);
    assert.deepEqual(await limited.json(), { success: false, error: `Wait ${wait}s` });
    // Cheap routes are counted in memory only
    assert.equal((await b.get('cheap')).status, 200);
  } finally {
    a.close(); b.close();
  }
  const rows = await (await getDb())!.query(`SELECT key, hits FROM rate_limits WHERE key LIKE 'spread/%'`);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].hits, 4);
  assert.match(rows[0].key, /^spread\/ip:[\w-]{22}$/);
  assert.doesNotMatch(rows[0].key, /127\.0\.0\.1/);
});

test('without the database, each instance still applies its own limit', async () => {
  const down = instance('down', async () => { throw new Error('connection refused'); });
  await down.ready;
  try {
    for (let i = 0; i < 3; i++) assert.equal((await down.get('costly')).status, 200);
    assert.equal((await down.get('costly')).status, 429);
  } finally {
    down.close();
  }
});

test('ended windows are removed', async () => {
  const db = (await getDb())!;
  await db.query(`INSERT INTO rate_limits (key, window_start, hits) VALUES ('old/ip:x', now() - interval '2 hours', 5)`);
  await (await openStore())!.pruneHits();
  assert.deepEqual(await db.query(`SELECT key FROM rate_limits WHERE key = 'old/ip:x'`), []);
});

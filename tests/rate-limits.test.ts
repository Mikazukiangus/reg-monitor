// API rate limits (server/rate-limits.ts): each route's limit per visitor,
// checked before the route runs, with a 429 that says how long to wait.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'net';
import { LIMITS, apiRateLimits } from '../server/rate-limits.ts';
import { createApp } from '../server/app.ts';

async function withServer(app: express.Express, run: (base: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.close();
  }
}

test('each API route is counted under its own limit', () => {
  const limitFor = (method: string, path: string) => LIMITS.find(l => l.applies(method, path))!;
  const cases: [string, string, string, number][] = [
    ['POST', '/api/feeds/sync', 'refresh', 6],
    ['GET', '/api/feeds/sync', 'api', 120],
    ['GET', '/api/feeds/poll', 'scheduled', 10],
    ['GET', '/api/digest', 'scheduled', 10],
    ['GET', '/api/notices/search', 'search', 30],
    ['GET', '/api/notices/by-id', 'by-id', 30],
    ['GET', '/api/feeds/status', 'status', 30],
    ['GET', '/api/feeds/checks', 'api', 120],
    ['GET', '/api/digest/rules', 'api', 120],
    ['GET', '/api/health', 'api', 120],
    ['GET', '/api/no-such-route', 'api', 120]
  ];
  for (const [method, path, name, limit] of cases) {
    const l = limitFor(method, path);
    assert.deepEqual([l.name, l.limit, l.windowMs], [name, limit, 60_000], `${method} ${path}`);
  }
});

test('past its limit a route answers 429 with Retry-After before it runs, and other routes are unaffected', async () => {
  const ran: string[] = [];
  const app = express();
  app.use('/api', apiRateLimits([
    { name: 'tight', applies: (_m, path) => path === '/api/tight', limit: 2, windowMs: 60_000, message: wait => `Wait ${wait}s` },
    { name: 'rest', applies: () => true, limit: 100, windowMs: 60_000, message: wait => `Wait ${wait}s` }
  ]));
  app.all('/api/:name', (req, res) => { ran.push(req.params.name); res.json({ ok: true }); });
  await withServer(app, async base => {
    for (let i = 0; i < 2; i++) assert.equal((await fetch(`${base}/api/tight`)).status, 200);
    const limited = await fetch(`${base}/api/tight`);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '60');
    assert.equal(limited.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await limited.json(), { success: false, error: 'Wait 60s' });
    assert.equal((await fetch(`${base}/api/other`)).status, 200);
  });
  assert.deepEqual(ran, ['tight', 'tight', 'other']);
});

test('the API limits each visitor to 120 general requests a minute', async () => {
  await withServer(createApp(), async base => {
    for (let i = 0; i < 120; i++) {
      const res = await fetch(`${base}/api/health`);
      assert.equal(res.status, 200, `request ${i + 1}`);
      await res.arrayBuffer();
    }
    const limited = await fetch(`${base}/api/health`);
    assert.equal(limited.status, 429);
    assert.match((await limited.json()).error, /^Too many requests\. Try again in \d+ seconds\.$/);
    // The scheduled jobs are counted separately (401 without the secret, not 429)
    const poll = await fetch(`${base}/api/feeds/poll`);
    assert.ok([401, 503].includes(poll.status));
    await poll.arrayBuffer();
  });
});

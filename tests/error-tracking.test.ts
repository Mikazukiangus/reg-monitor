// Error tracking (server/error-tracking.ts): unexpected errors are recorded
// with where they happened and a reference, grouped by kind, redacted; the
// visitor is told only a fixed message and the reference; browsers report
// their own errors; and reading what was recorded needs the cron secret.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.DATABASE_URL = 'pglite';
process.env.CRON_SECRET = 'error-tracking-test-secret-0123456789abcdef';
process.env.RESEND_API_KEY = 're_errortracking_0123456789abcdefghij';
const { createApp } = await import('../server/app.ts');
const { openStore } = await import('../server/store.ts');
const { getDb } = await import('../server/db.ts');
const { captureError, explainError, flushErrors, RECORDS_PER_MINUTE } = await import('../server/error-tracking.ts');
const { SourceError, UNEXPLAINED } = await import('../server/errors.ts');

const AUTH = { authorization: `Bearer ${process.env.CRON_SECRET}` };

async function serve(run: (url: (path: string) => string) => Promise<void>) {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await run(path => `${base}${path}`);
  } finally {
    server.close();
  }
}

const occurrences = async (where: string) => (await getDb())!.query(
  `SELECT e.source, e.location, e.name, e.message, e.stack, e.occurrences, v.reference, v.context
   FROM errors e JOIN error_events v USING (fingerprint) WHERE e.location = $1 ORDER BY v.at`, [where]);

test('a failed request tells the visitor a fixed message and a reference, and records the error under it', async () => {
  const store = (await openStore())!;
  const search = store.search;
  store.search = async () => { throw new Error(`relation "notices" is locked by key=${process.env.RESEND_API_KEY}`); };
  try {
    await serve(async url => {
      const res = await fetch(url('/api/notices/search?q=liquidity&limit=5'));
      assert.equal(res.status, 500);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      const body = await res.json();
      assert.match(body.reference, /^[\dA-F]{10}$/);
      assert.deepEqual(body, { success: false, error: 'Search failed', reference: body.reference });
      await flushErrors();

      const [row] = await occurrences('GET /api/notices/search');
      assert.equal(row.reference, body.reference);
      assert.equal(row.source, 'server');
      assert.equal(row.name, 'Error');
      // Redacted before it was stored; the search text is not kept
      assert.ok(row.message.includes('relation "notices" is locked'));
      assert.ok(!JSON.stringify(row).includes(process.env.RESEND_API_KEY!));
      assert.ok(!JSON.stringify(row).includes('liquidity'));
      assert.match(row.stack, /error-tracking\.test\.ts:\d+:\d+/);
      assert.ok(!row.stack.includes(process.cwd()), 'paths are relative');
      assert.equal(row.context.deployment, 'local');

      // The reference finds it, with the cron secret only
      assert.equal((await fetch(url(`/api/errors?reference=${body.reference}`))).status, 401);
      const found = await (await fetch(url(`/api/errors?reference=${body.reference.toLowerCase()}`), { headers: AUTH })).json();
      assert.equal(found.reference, body.reference);
      assert.equal(found.kind.location, 'GET /api/notices/search');
      assert.equal(found.kind.occurrences, 1);
      assert.equal((await fetch(url('/api/errors?reference=0000000000'), { headers: AUTH })).status, 404);
      assert.equal((await fetch(url('/api/errors?reference=nope'), { headers: AUTH })).status, 400);
    });
  } finally {
    store.search = search;
  }
});

test('the same error is one kind, however its numbers and addresses differ', async () => {
  for (const [id, url] of [[17, 'https://a.example/x?id=1'], [4_210, 'https://b.example/y']]) {
    captureError(new TypeError(`Row ${id} from ${url} has no title`), { where: 'Kinds test', notice: id });
  }
  captureError(new TypeError('Something else entirely'), { where: 'Kinds test' });
  await flushErrors();
  const kinds = (await (await openStore())!.errorKinds(3_600_000, 50)).filter(k => k.location === 'Kinds test');
  assert.deepEqual(kinds.map(k => [k.message.startsWith('Row') ? 'row' : 'other', k.occurrences, k.recent, k.references.length]).sort(),
    [['other', 1, 1, 1], ['row', 2, 2, 2]]);
  assert.ok(kinds.every(k => k.name === 'TypeError'));
});

test('a flood of one kind is recorded a few times a minute, and logged every time', async () => {
  const references = Array.from({ length: RECORDS_PER_MINUTE + 5 }, () => captureError(new Error('Flood'), { where: 'Flood test' }));
  await flushErrors();
  assert.equal(new Set(references).size, RECORDS_PER_MINUTE + 5);
  assert.equal((await occurrences('Flood test')).length, RECORDS_PER_MINUTE);
});

test('without the database an error still gets a reference, and nothing throws', async () => {
  const reference = captureError(new Error('Down'), { where: 'Down test' }, { store: async () => { throw new Error('connection refused'); } });
  assert.match(reference, /^[\dA-F]{10}$/);
  await flushErrors();
  assert.deepEqual(await occurrences('Down test'), []);
  // Nor when what was thrown is not an Error
  assert.match(captureError(undefined, { where: 'Nothing thrown' }, { store: async () => null }), /^[\dA-F]{10}$/);
});

test('a failure with a message written for visitors is not captured; one without is', async () => {
  assert.equal(explainError(new SourceError('HTTP 403'), { where: 'Explained test' }), 'HTTP 403');
  assert.equal(explainError(new RangeError('Invalid time value'), { where: 'Unexplained test' }), UNEXPLAINED);
  await flushErrors();
  assert.deepEqual(await occurrences('Explained test'), []);
  assert.equal((await occurrences('Unexplained test')).length, 1);
});

test('a browser reports its own errors; anything else sent is refused', async () => {
  await serve(async url => {
    const post = (body: string, type = 'application/json', path = '/api/errors') =>
      fetch(url(path), { method: 'POST', headers: { 'content-type': type }, body });
    const report = {
      where: 'render', name: 'TypeError', message: "Cannot read properties of undefined (reading 'title')",
      stack: 'TypeError: x\n    at NoticeCard (https://reg.example/assets/index-abc.js:1:2345)', path: '/feed?q=private#notice-1'
    };
    const res = await post(JSON.stringify(report));
    assert.equal(res.status, 200);
    const { reference } = await res.json();
    await flushErrors();
    const [row] = await occurrences('render');
    assert.equal(row.reference, reference);
    assert.equal(row.source, 'browser');
    assert.equal(row.name, 'TypeError');
    assert.match(row.stack, /^at NoticeCard/);
    // The path without what was searched
    assert.equal(row.context.path, '/feed');

    for (const [body, status] of [
      [JSON.stringify({ ...report, cookie: 'x' }), 400],
      [JSON.stringify({ where: 'render' }), 400],
      [JSON.stringify({ ...report, where: 'render<script>' }), 400],
      [JSON.stringify({ ...report, message: 'x'.repeat(1001) }), 400],
      ['{not json', 400],
      [JSON.stringify({ ...report, stack: 'x'.repeat(9000) }), 413]
    ] as const) assert.equal((await post(body)).status, status, body.slice(0, 60));
    assert.equal((await post('message=x', 'text/plain')).status, 415);
    // Other routes still take no body
    assert.equal((await post(JSON.stringify(report), 'application/json', '/api/feeds/sync')).status, 400);
  });
});

test('the kinds seen lately are listed, newest first, with the cron secret', async () => {
  await serve(async url => {
    assert.equal((await fetch(url('/api/errors'))).status, 401);
    const body = await (await fetch(url('/api/errors?hours=1&limit=3'), { headers: AUTH })).json();
    assert.equal(body.hours, 1);
    assert.equal(body.kinds.length, 3);
    const seen = body.kinds.map((k: { lastSeen: string }) => k.lastSeen);
    assert.deepEqual(seen, [...seen].sort().reverse());
    assert.equal((await fetch(url('/api/errors?hours=0'), { headers: AUTH })).status, 400);
  });
});

test('old occurrences and kinds are removed', async () => {
  const db = (await getDb())!;
  await db.query(`INSERT INTO errors (fingerprint, source, location, name, message, last_seen) VALUES ('old', 'server', 'Old test', 'Error', 'x', now() - interval '100 days')`);
  await db.query(`INSERT INTO error_events (reference, fingerprint, at, context) VALUES ('OLD0000000', 'old', now() - interval '100 days', '{}')`);
  captureError(new Error('Recent'), { where: 'Recent test' });
  await flushErrors();
  await (await openStore())!.pruneErrors();
  assert.deepEqual(await db.query(`SELECT 1 FROM errors WHERE fingerprint = 'old'`), []);
  assert.deepEqual(await db.query(`SELECT 1 FROM error_events WHERE reference = 'OLD0000000'`), []);
  assert.equal((await occurrences('Recent test')).length, 1);
});

test('the digest says how many unexpected errors there were in the last 24 hours', async () => {
  const { renderDigest } = await import('../server/digest/email.ts');
  const { recentErrors } = await import('../server/services/digest.ts');
  const count = await recentErrors();
  assert.ok(count!.occurrences > count!.kinds && count!.kinds > 0, JSON.stringify(count));
  assert.equal(await recentErrors(async () => null), null);
  const { text, html } = renderDigest([], '2026-10-21', 'https://regsonar.example.com', [], { occurrences: 3, kinds: 2 });
  assert.match(text, /Unexpected errors in the last 24 hours: 3 \(2 kinds\)\. GET \/api\/errors/);
  assert.match(html, /Unexpected errors in the last 24 hours: 3 \(2 kinds\)/);
  assert.doesNotMatch(renderDigest([], '2026-10-21', 'https://regsonar.example.com', [], { occurrences: 0, kinds: 0 }).text, /Unexpected errors/);
});

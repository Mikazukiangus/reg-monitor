// Every API request is checked against what its route accepts before the
// route runs (server/validate.ts), and what the browser reads back from its
// own storage is checked before use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'net';

const { createApp } = await import('../server/app.ts');
const { accepts, day, flag, idList, text } = await import('../server/validate.ts');
const { readAlertRules, isAlertRule } = await import('../src/lib/preferences.ts');
const { DEFAULT_RULES } = await import('../shared/alertRules.ts');

// Requests that are refused never reach a route, so none of these reads a
// source, the history or the mailer
async function withApp(run: (ask: (path: string, init?: RequestInit) => Promise<{ status: number; body: any; allow: string | null }>) => Promise<void>) {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(async (path, init) => {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, init);
      return { status: res.status, body: await res.json(), allow: res.headers.get('allow') };
    });
  } finally {
    server.close();
  }
}

test('a method a route does not answer is refused with the methods it does', async () => {
  await withApp(async ask => {
    for (const [path, method, allow] of [
      ['/api/health', 'POST', 'GET, HEAD'], ['/api/feeds/sync', 'PUT', 'GET, POST, HEAD'], ['/api/feeds/sync', 'DELETE', 'GET, POST, HEAD'],
      ['/api/feeds/poll', 'POST', 'GET, HEAD'], ['/api/digest', 'POST', 'GET, HEAD'], ['/api/notices/search?q=ai', 'PATCH', 'GET, HEAD']
    ]) {
      const res = await ask(path, { method });
      assert.equal(res.status, 405, `${method} ${path}`);
      assert.equal(res.allow, allow);
      assert.deepEqual(res.body, { success: false, error: 'Method not allowed' });
    }
  });
});

test('a request body is refused, unread', async () => {
  await withApp(async ask => {
    const res = await ask('/api/feeds/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"refresh": true}' });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { success: false, error: 'This request takes no body' });
  });
});

test('unknown, repeated, missing and invalid query parameters are refused, without repeating what was sent', async () => {
  await withApp(async ask => {
    const cases: [string, string][] = [
      ['/api/health?verbose=1', 'Unexpected query parameter'],
      ['/api/feeds/sync?nocache=<script>', 'Unexpected query parameter'],
      ['/api/notices/search', 'q is required: 2 to 200 characters'],
      ['/api/notices/search?q=a', 'q must be 2 to 200 characters'],
      [`/api/notices/search?q=${'x'.repeat(201)}`, 'q must be 2 to 200 characters'],
      ['/api/notices/search?q=ai&q=data', 'q may be given only once'],
      ['/api/notices/search?q[$ne]=x', 'Unexpected query parameter'],
      ['/api/notices/by-id?ids=not-json', 'ids must be a JSON array of 1 to 50 notice ids'],
      [`/api/notices/by-id?ids=${encodeURIComponent(JSON.stringify(Array(51).fill('x')))}`, 'ids must be a JSON array of 1 to 50 notice ids'],
      [`/api/notices/by-id?ids=${encodeURIComponent('[1, 2]')}`, 'ids must be a JSON array of 1 to 50 notice ids'],
      // Checked before the cron secret, so a typo never sends a real email
      ['/api/digest?dryRun=true', 'dryRun must be 1 or 0'],
      ['/api/digest?date=2026-02-30', 'date must be a calendar day as YYYY-MM-DD'],
      ['/api/digest?date=2026-1-5', 'date must be a calendar day as YYYY-MM-DD']
    ];
    for (const [path, error] of cases) {
      const res = await ask(path);
      assert.equal(res.status, 400, path);
      assert.deepEqual(res.body, { success: false, error }, path);
    }
  });
});

test('an API address no route answers is a JSON 404', async () => {
  await withApp(async ask => {
    const res = await ask('/api/no-such-route');
    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { success: false, error: 'Not found' });
  });
});

test('a request that passes reaches its route with its parsed values', () => {
  const params = { q: text(2, 200, true), day, dryRun: flag, ids: idList(3) };
  const check = accepts(['GET'], params);
  const locals: any = {};
  let reached = false;
  const req: any = { method: 'GET', query: { q: '  ai rules ', day: '2024-02-29', dryRun: '0', ids: '["a","b"]' }, get: () => undefined };
  check(req, { locals } as any, () => { reached = true; });
  assert.ok(reached);
  assert.deepEqual(locals.query, { q: 'ai rules', day: '2024-02-29', dryRun: false, ids: ['a', 'b'] });
  assert.equal(day.parse('2025-02-29'), undefined, 'not a leap year');
  assert.equal(flag.parse('true'), undefined);
  assert.equal(idList(3).parse('["a","b","c","d"]'), undefined);
  assert.equal(idList(3).parse('[""]'), undefined);
});

test('saved alert rules that are not well formed are left out', () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  const good = { id: 'r1', name: 'SEC', jurisdictions: ['SEC'], minImpact: 7, keywords: [], enabled: true };
  values.set('regsonar.alertRules', JSON.stringify([good, { ...good, id: 'r2', keywords: 'ai' }, { ...good, id: 'r3', minImpact: '7' }, null, 'rule']));
  assert.deepEqual(readAlertRules(storage), [good]);
  values.set('regsonar.alertRules', '{"not": "a list"}');
  assert.deepEqual(readAlertRules(storage), DEFAULT_RULES);
  assert.ok(DEFAULT_RULES.every(isAlertRule), 'the default rules are well formed');
});

test('the notices seen on the last visit are read as a list of ids, whatever is stored', async () => {
  const values = new Map<string, string>();
  (globalThis as any).localStorage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
  try {
    const { readPreviousVisit, recordVisit } = await import('../src/lib/visits.ts');
    values.set('regsonar.seenNoticeIds', JSON.stringify(['a', 1, null, 'b']));
    values.set('regsonar.lastVisitAt', 'not a date');
    const visit = readPreviousVisit();
    assert.deepEqual([...visit!.seenIds], ['a', 'b']);
    assert.equal(visit!.at, null);
    values.set('regsonar.seenNoticeIds', '{"a": 1}');
    assert.deepEqual([...readPreviousVisit()!.seenIds], []);
    recordVisit(['c']);
    assert.deepEqual(JSON.parse(values.get('regsonar.seenNoticeIds')!), ['c']);
  } finally {
    delete (globalThis as any).localStorage;
  }
});

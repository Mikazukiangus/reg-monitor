// The browser's API client (src/api/client.ts), against a stubbed fetch
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFeed, fetchScheduledChecks, noticesById, noticesByIdBatches, searchHistory } from '../src/api/client.ts';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// Answers each request with the reply for its address, and records the addresses
function stubFetch(reply: (url: string, init?: RequestInit) => Response) {
  const calls: { url: string; method: string }[] = [];
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? 'GET' });
    return reply(String(input), init);
  }) as typeof fetch;
  return calls;
}
// A notice the page can show (src/lib/noticeShape.ts)
const notice = (id: string, extra: Record<string, unknown> = {}) => ({
  id, ref: `MAS ${id}`, title: 'MAS consults on capital rules', regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
  type: 'CONSULTATION', typeColorClass: { bg: 'bg-x', text: 'text-x' }, impactScore: 7, issuedTimeAgo: '2 days ago', tags: ['MAS'],
  sector: 'Banking & Prudential', format: 'Consultations', severity: 'high', dossierUrl: 'https://www.mas.gov.sg/x', ...extra
});
const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json', ...init.headers }, status: init.status });

test('the feed: a forced refresh posts, and the reply says rate limited, failed or ok with the saved copy marker', async () => {
  const calls = stubFetch(() => new Response('', { status: 429, headers: { 'Retry-After': '30' } }));
  assert.deepEqual(await fetchFeed(true), { kind: 'rateLimited', retryAfter: '30' });
  assert.deepEqual(calls, [{ url: '/api/feeds/sync', method: 'POST' }]);

  stubFetch(() => new Response('', { status: 503 }));
  assert.deepEqual(await fetchFeed(false), { kind: 'failed', status: 503 });

  stubFetch(() => json({ notices: [], lastSync: '2026-10-19T00:00:00Z' }, { headers: { 'X-RegSonar-Saved': '2026-10-18T00:00:00Z' } }));
  assert.deepEqual(await fetchFeed(false), { kind: 'ok', data: { notices: [], lastSync: '2026-10-19T00:00:00Z' }, savedAt: '2026-10-18T00:00:00Z', leftOut: [] });

  // A reply that is not JSON, or not a feed, is reported as malformed rather than as an unreachable server
  stubFetch(() => new Response('<html>Gateway error</html>', { status: 200 }));
  assert.deepEqual(await fetchFeed(false), { kind: 'malformed', problem: 'the reply is not JSON' });
  stubFetch(() => json({ success: true, notice: [] }));
  assert.deepEqual(await fetchFeed(false), { kind: 'malformed', problem: 'the reply has no notices list' });
});

test('notices by id are asked for 50 at a time, and a failed batch stops after the ones found', async () => {
  const ids = Array.from({ length: 120 }, (_, i) => `n${i}`);
  const calls = stubFetch(url => {
    const asked: string[] = JSON.parse(new URL(url, 'http://x').searchParams.get('ids')!);
    return json({ notices: asked.map(id => notice(id)) });
  });
  const found = await noticesById(ids);
  assert.equal(calls.length, 3);
  assert.deepEqual(found.map(n => n.id), ids);

  let n = 0;
  stubFetch(() => (n++ === 0 ? json({ notices: [notice('a')] }) : new Response('', { status: 500 })));
  const batches: string[][] = [];
  await assert.rejects(async () => {
    for await (const batch of noticesByIdBatches(ids)) batches.push(batch.map(b => b.id));
  });
  assert.deepEqual(batches, [['a']]);
});

test('history search encodes the text, and fails rather than finding nothing when the server has no answer', async () => {
  const calls = stubFetch(() => json({ notices: [notice('x')] }));
  assert.deepEqual((await searchHistory('AI & data')).map(n => n.id), ['x']);
  assert.equal(calls[0].url, '/api/notices/search?q=AI%20%26%20data');
  stubFetch(() => new Response('', { status: 503 }));
  await assert.rejects(searchHistory('AI'), /HTTP 503/);
  stubFetch(() => json({ success: true }));
  await assert.rejects(searchHistory('AI'), /no notices/);
});

test('scheduled checks fail when the server says it could not read them', async () => {
  stubFetch(() => json({ success: false }));
  await assert.rejects(fetchScheduledChecks());
  stubFetch(() => json({ success: true, enabled: false }));
  assert.equal((await fetchScheduledChecks()).enabled, false);
});

test('search and by-id replies are checked like the feed: notices that cannot be shown are left out, unsafe links dropped', async () => {
  const replied = { notices: [notice('ok'), { id: 'bare' }, notice('js', { dossierUrl: 'javascript:alert(1)' })] };
  stubFetch(() => json(replied));
  const found = await searchHistory('capital');
  assert.deepEqual(found.map(n => [n.id, n.dossierUrl]), [['ok', 'https://www.mas.gov.sg/x'], ['js', undefined]]);
  stubFetch(() => json(replied));
  assert.deepEqual((await noticesById(['ok', 'bare', 'js'])).map(n => n.id), ['ok', 'js']);
});

// The background queue (server/queue.ts) on the history database: documents
// read for key points after the refresh has answered, and the digest sent
// with retries over the next hours
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite';
process.env.RETRY_BASE_DELAY_MS = '1';
process.env.RESEND_API_KEY = 're_test_key';
process.env.DIGEST_TO = 'owner@example.com';
const { getDb } = await import('../server/db.ts');
const { openStore } = await import('../server/store.ts');
const { drainQueue, keyPointJobs, digestJob } = await import('../server/queue.ts');
const { refreshSource } = await import('../server/ingest.ts');
const { runDigest } = await import('../server/services/digest.ts');
type NormalizedNotice = import('../server/notice.ts').NormalizedNotice;

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const notice = (id: string, fields: Partial<NormalizedNotice> = {}): NormalizedNotice => ({
  id, ref: id, title: `Circular ${id} on liquidity risk`, regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
  type: 'CIRCULAR', typeColorClass: { bg: '', text: '' }, impactScore: 5, issuedTimeAgo: '', tags: [],
  sector: 'Banking & Prudential', sectors: ['Banking & Prudential'], format: 'Circulars', severity: 'info',
  dossierUrl: `https://www.mas.gov.sg/news/${id}`, publishedAt: '2026-10-20T02:00:00.000Z', ...fields
} as NormalizedNotice);

const ARTICLE = `<html><body><article><h1>Circular on liquidity risk</h1>${[
  'Banks must hold enough high-quality liquid assets to cover thirty days of stressed outflows under the revised framework.',
  'The Authority will apply the new liquidity coverage requirements to all domestic systemically important banks from 1 January 2027.',
  'Banks should report their liquidity positions monthly and notify the Authority promptly of any shortfall against the minimum ratio.',
  'Comments on the proposed transition arrangements should be submitted by 30 November 2026 through the consultation portal.'
].map(p => `<p>${p}</p>`).join('')}</article></body></html>`;

// Pages by address; anything else is a 404. Returns the addresses asked for.
function sites(pages: Record<string, () => Response>) {
  const asked: string[] = [];
  globalThis.fetch = (async (url: string) => {
    asked.push(String(url));
    const page = pages[String(url)];
    return page ? page() : new Response('', { status: 404 });
  }) as typeof fetch;
  return asked;
}
const html = (body: string) => () => new Response(body, { status: 200, headers: { 'content-type': 'text/html' } });

async function jobs() {
  const db = (await getDb())!;
  return db.query(`SELECT kind, key, status, attempts, last_error, run_at > now() AS later FROM jobs ORDER BY id`);
}

test('a job waiting is listed once; a one-off is not queued again once done', async () => {
  const store = (await openStore())!;
  assert.equal(await store.enqueue(keyPointJobs([notice('a'), notice('a'), notice('b', { keyPoints: { points: [] } as any }), notice('c', { dossierUrl: undefined })])), 1);
  assert.equal(await store.enqueue(keyPointJobs([notice('a')])), 0);
  const email = { subject: 's', html: 'h', text: 't' };
  assert.equal(await store.enqueue([digestJob('2026-10-01', email)]), 1);
  const [job] = await store.claim(1, 60_000, ['digest']);
  await store.finishJob(job.id);
  assert.equal(await store.enqueue([digestJob('2026-10-01', email)]), 0, 'that day was sent');
  // A job taken by a worker is not taken by another until its lease has passed
  const [taken] = await store.claim(1, 50, ['key-points']);
  assert.equal(taken.key, 'a');
  assert.deepEqual(await store.claim(1, 50, ['key-points']), []);
  await new Promise(resolve => setTimeout(resolve, 80));
  const [again] = await store.claim(1, 60_000, ['key-points']);
  assert.deepEqual([again.key, again.attempts], ['a', 2]);
  await store.finishJob(again.id);
});

test('a refresh answers without reading documents; the queue reads them after and stores the key points', async () => {
  const store = (await openStore())!;
  const asked = sites({ 'https://www.mas.gov.sg/news/r1': html(ARTICLE) });
  const state = await refreshSource({ id: 'mas-test', name: 'MAS test', fetch: async () => [notice('r1')] } as any);
  // Answered with the notice, its document not read in the refresh
  assert.equal(state.notices[0].keyPoints, undefined);
  // The after-response drain reads it
  for (let i = 0; i < 50 && !(await store.byIds(['r1'])).get('r1')?.keyPoints; i++) await new Promise(resolve => setTimeout(resolve, 50));
  const stored = (await store.byIds(['r1'])).get('r1')!;
  assert.ok(stored.keyPoints, 'key points stored');
  assert.equal(stored.title, 'Circular r1 on liquidity risk', 'the rest of the notice kept');
  assert.ok(asked.includes('https://www.mas.gov.sg/news/r1'));
  assert.deepEqual((await jobs()).filter(j => j.key === 'r1').map(j => j.status), ['done']);
});

test('a document that cannot be read is tried again later, then given up', async () => {
  const store = (await openStore())!;
  sites({});
  await store.save([notice('gone')], 'mas-test');
  await store.enqueue(keyPointJobs([notice('gone')]));
  const db = (await getDb())!;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const [outcome] = (await drainQueue(store, { until: Date.now() + 5000, kinds: ['key-points'] })).filter(o => o.key === 'gone');
    assert.equal(outcome.ok, false);
    const [row] = (await jobs()).filter(j => j.key === 'gone');
    assert.equal(row.attempts, attempt);
    assert.equal(row.status, attempt < 4 ? 'queued' : 'failed');
    if (attempt < 4) {
      assert.equal(row.later, true, 'waits before the next try');
      await db.query(`UPDATE jobs SET run_at = now() WHERE key = 'gone'`);
    }
  }
  assert.deepEqual(await store.jobCounts(), { waiting: 0, failed: 1 });
});

test('a digest Resend cannot take now is sent on a later try, with the same idempotency key', async () => {
  const store = (await openStore())!;
  const deps = {
    collect: async () => ({ notices: [notice('d1', { title: 'MAS fines bank d1', type: 'ENFORCEMENT', format: 'Enforcement', impactScore: 8, publishedAt: '2026-10-21T03:00:00.000Z' } as any)], failed: [] }),
    send: async () => { throw new Error('the queue sends it'); },
    rules: [{ id: 'r', name: 'MAS', jurisdictions: ['MAS'], minImpact: 5, keywords: ['fines'], enabled: true }],
    siteUrl: 'https://example.org',
    mail: { apiKey: 're_test_key', to: ['owner@example.com'], from: 'RegSonar <digest@example.org>' },
    store: openStore
  };
  const keys: string[] = [];
  let up = false;
  globalThis.fetch = (async (_url: string, init: any) => {
    keys.push(init.headers['Idempotency-Key']);
    return up ? Response.json({ id: 'email-9' }) : new Response('{}', { status: 503 });
  }) as typeof fetch;
  const first = await runDigest({ day: '2026-10-21' }, deps);
  assert.equal(first.kind, 'queued');
  const [row] = (await jobs()).filter(j => j.kind === 'digest' && j.key === '2026-10-21');
  assert.deepEqual([row.status, row.attempts, row.later], ['queued', 1, true]);

  up = true;
  await (await getDb())!.query(`UPDATE jobs SET run_at = now() WHERE key = '2026-10-21'`);
  const [sent] = await drainQueue(store, { until: Date.now() + 5000, kinds: ['digest'] });
  assert.deepEqual([sent.ok, (sent.result as any).id], [true, 'email-9']);
  assert.equal(new Set(keys).size, 1, 'every try of the job used one key');
  // The cron calling again that day sends nothing more
  const again = await runDigest({ day: '2026-10-21' }, deps);
  assert.equal(again.kind, 'queued');
  assert.equal(keys.length, 4);
});

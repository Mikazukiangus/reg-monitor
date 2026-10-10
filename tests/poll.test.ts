// The scheduled check of every source, against the recorded responses and an
// in-memory history database
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

process.env.VERCEL = '1';
process.env.DATABASE_URL = 'pglite';

const fixtures: Record<string, { file: string; contentType: string }> = JSON.parse(readFileSync('tests/fixtures/index.json', 'utf8'));
const withoutLimit = (url: string) =>
  url.replace(/([?&])(per_page|rows|count)=\d+/g, '$1$2=N').replace(/%22limit%22%3A\d+/g, '%22limit%22%3AN');
const byUrl = new Map(Object.entries(fixtures).map(([url, f]) => [withoutLimit(url), f]));

const requested: string[] = [];
let finraStatus = 200;
// Article pages served to the date backfill test, by URL
const pages = new Map<string, string>();

globalThis.fetch = (async (input: any) => {
  const url = String(input instanceof Request ? input.url : input);
  requested.push(url);
  if (pages.has(url)) return new Response(pages.get(url), { status: 200, headers: { 'content-type': 'text/html' } });
  if (url.includes('finra.org') && finraStatus !== 200) return new Response('', { status: finraStatus });
  const fixture = byUrl.get(withoutLimit(url));
  // Documents read for key points were not recorded
  if (!fixture) return new Response('Not found', { status: 404 });
  const status = url.includes('fca.org.uk') ? 403 : 200;
  return new Response(readFileSync(`tests/fixtures/${fixture.file}`), { status, headers: { 'content-type': fixture.contentType } });
}) as typeof fetch;

const { SOURCES, pollSources } = await import('../server.ts');

test('the first check fills the history, reading further back where the list was full', async () => {
  const { results, failed } = await pollSources();
  assert.deepEqual(failed.map(f => f.name), ['UK FCA News RSS']);
  assert.ok(results.every(r => r.added === r.read), 'everything is new to an empty history');
  const full = results.filter(r => r.backfilled);
  assert.ok(full.length > 0, 'some list had 20 or more items');
  assert.ok(full.every(r => r.read > 0));
  assert.ok(results.filter(r => r.read < 20).every(r => !r.backfilled), 'a short list is not read twice');
});

test('a second check adds nothing and does not read further back', async () => {
  const { results } = await pollSources();
  assert.ok(results.every(r => r.added === 0 && !r.backfilled), JSON.stringify(results.map(({ notices, ...r }) => r)));
});

test('after an HTTP 429 the site is not asked again for a while', async () => {
  const finra = SOURCES.find(s => s.name === 'FINRA Notices')!;
  finraStatus = 429;
  await assert.rejects(finra.fetch(), /HTTP 429/);
  const before = requested.filter(u => u.includes('finra.org')).length;
  finraStatus = 200;
  await assert.rejects(finra.fetch(), /not asking again until/);
  assert.equal(requested.filter(u => u.includes('finra.org')).length, before);
});

test('a stored notice without a date takes the date its page states, once', async () => {
  const { getDb, saveNotices, storedNotices } = await import('../db.ts');
  const db = (await getDb())!;
  const body = '<p>' + 'The FCA has set out clearer expectations for asset managers about long-term investments. '.repeat(6) + '</p>';
  const dated = 'https://www.fca.org.uk/news/press-releases/dated-example';
  const missing = 'https://www.fca.org.uk/news/press-releases/missing-example';
  pages.set(dated, `<html><head><meta property="article:published_time" content="2026-09-15T09:00:00Z"></head><body><article><h1>Dated</h1>${body}</article></body></html>`);
  const base = { regulator: 'UK FCA', jurisdictionCode: 'UK_EU', format: 'Announcements', type: 'ANNOUNCEMENTS', jurisdiction: 'UNITED KINGDOM',
    impactScore: 5, issuedTimeAgo: 'Recently', tags: [], sector: 'Capital Markets & Listings', severity: 'info',
    keyPoints: { points: ['A point.'], facts: [], refs: [], method: 'extractive' } };
  await saveNotices(db, [
    { ...base, id: 'fca-dated-example', title: 'Dated example', dossierUrl: dated },
    { ...base, id: 'fca-missing-example', title: 'Missing example', dossierUrl: missing }
  ]);
  const first = await pollSources();
  assert.equal(first.pageDatesFound, 1);
  const stored = await storedNotices(db, ['fca-dated-example', 'fca-missing-example']);
  assert.equal(stored.get('fca-dated-example')?.publishedAt, '2026-09-15T09:00:00.000Z');
  assert.equal(stored.get('fca-missing-example')?.publishedAt, undefined);
  assert.equal(stored.get('fca-missing-example')?.pageDateTried, true);
  requested.length = 0;
  await pollSources();
  assert.ok(!requested.includes(dated) && !requested.includes(missing), 'pages are not read again');
});

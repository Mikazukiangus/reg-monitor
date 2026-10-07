// Each source's parser, run against responses recorded from the real feeds
// (tests/fixtures). A format change on a regulator's site shows up here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

process.env.VERCEL = '1';
delete process.env.DATABASE_URL;

const fixtures: Record<string, { file: string; contentType: string }> = JSON.parse(readFileSync('tests/fixtures/index.json', 'utf8'));

// The Federal Register and MAS put the item limit in the URL; the recorded
// response holds more items than any test asks for, so the limit is ignored
const withoutLimit = (url: string) => url.replace(/([?&])(per_page|rows)=\d+/g, '$1$2=N');
const byUrl = new Map(Object.entries(fixtures).map(([url, f]) => [withoutLimit(url), f]));

const requested: string[] = [];

globalThis.fetch = (async (input: any) => {
  const url = String(input instanceof Request ? input.url : input);
  requested.push(url);
  const fixture = byUrl.get(withoutLimit(url));
  if (!fixture) throw new Error(`No fixture for ${url}`);
  // The FCA feed was recorded while Cloudflare was blocking it
  const status = url.includes('fca.org.uk') ? 403 : 200;
  return new Response(readFileSync(`tests/fixtures/${fixture.file}`), { status, headers: { 'content-type': fixture.contentType } });
}) as typeof fetch;

const { SOURCES, zonedToIso, parseHkmaDailyStats } = await import('../server.ts');

const JURISDICTIONS = ['SG', 'HK', 'AU', 'JP', 'UK_EU', 'US', 'GLOBAL'];
const FORMATS = ['Circulars', 'Consultations', 'Enforcement', 'Guidelines', 'Technical Standards'];

for (const source of SOURCES) {
  if (source.inDigest === false) continue;

  if (source.name === 'UK FCA News RSS') {
    test('UK FCA: a blocked feed is reported as an error', async () => {
      await assert.rejects(source.fetch(), /HTTP 403/);
    });
    continue;
  }

  test(`${source.name}: notices are complete and well formed`, async () => {
    const notices = await source.fetch();
    assert.ok(notices.length > 0, 'no notices parsed');
    assert.equal(new Set(notices.map(n => n.id)).size, notices.length, 'duplicate ids');
    for (const n of notices) {
      assert.ok(n.title && n.title.trim().length > 5, `title: ${n.title}`);
      assert.ok(n.regulator, 'regulator');
      assert.ok(JURISDICTIONS.includes(n.jurisdictionCode), `jurisdiction ${n.jurisdictionCode}`);
      assert.ok(FORMATS.includes(n.format), `format ${n.format}`);
      assert.match(String(n.dossierUrl), /^https:\/\//, 'link');
      assert.ok(n.publishedAt, `no date for ${n.id}`);
      const t = Date.parse(n.publishedAt!);
      assert.ok(t > Date.UTC(2020, 0, 1) && t < Date.now() + 2 * 86_400_000, `date ${n.publishedAt}`);
    }
  });

  test(`${source.name}: the item limit is honoured`, async () => {
    requested.length = 0;
    const few = await source.fetch(1);
    // APIs that apply the limit themselves are asked for one item
    const askedForOne = requested.some(url => /[?&](per_page|rows)=1(&|$)/.test(url));
    assert.ok(few.length === 1 || askedForOne, `${few.length} items`);
  });
}

const byName = (name: string) => SOURCES.find(s => s.name === name)!;

test('MAS times are Singapore local time, not UTC', async () => {
  const notices = await byName('MAS Circulars & Guidelines').fetch();
  const ai = notices.find(n => /Artificial Intelligence Risk Management/.test(n.title));
  assert.equal(ai?.publishedAt, '2026-10-07T03:00:00.000Z');
});

test('MAS consultations carry the closing date MAS publishes', async () => {
  const notices = await byName('MAS Consultations').fetch();
  assert.ok(notices.every(n => /^Comments clos(e|ed): \d{4}-\d{2}-\d{2}$/.test(n.statutoryDeadline || '')));
});

test('ASIC times are Sydney local time, not UTC', async () => {
  const notices = await byName('ASIC Media Releases').fetch();
  const saad = notices.find(n => n.id === 'asic-26-233MR');
  assert.equal(saad?.publishedAt, '2026-10-07T00:13:00.000Z');
  assert.equal(saad?.format, 'Enforcement');
  assert.ok(!saad?.title.startsWith('26-233MR'), 'document number stripped from title');
});

test('JFSA leaves out press conferences and the weekly newsletter', async () => {
  const notices = await byName('JFSA News').fetch(20);
  assert.ok(notices.length > 0);
  assert.ok(notices.every(n => !/Press Conference|Weekly Review/i.test(n.title)));
  assert.ok(notices.every(n => !n.title.includes(',') || !/^(Publication|Policies|Others),/.test(n.title)), 'category prefix removed');
});

test('HKEX disciplinary actions are classed as enforcement', async () => {
  const notices = await byName('HKEX Regulatory Announcements').fetch(20);
  const disciplinary = notices.filter(n => /Disciplinary Action/i.test(n.title));
  assert.ok(disciplinary.length > 0);
  assert.ok(disciplinary.every(n => n.format === 'Enforcement'));
});

test('SFC circular titles drop the audience line', async () => {
  const notices = await byName('SFC Circulars').fetch();
  assert.ok(notices.every(n => !/^Circular to /.test(n.title)));
});

test('ESMA dates come from the description', async () => {
  const notices = await byName('ESMA News').fetch();
  assert.ok(notices.every(n => /^\d{4}-\d{2}-\d{2}T/.test(n.publishedAt || '')));
});

test('zonedToIso converts local times, including daylight saving', () => {
  assert.equal(zonedToIso('2026-10-07T11:13:00Z', 'Australia/Sydney'), '2026-10-07T00:13:00.000Z');
  assert.equal(zonedToIso('2026-07-01T10:00:00', 'Australia/Sydney'), '2026-07-01T00:00:00.000Z');
  assert.equal(zonedToIso('2026-10-07T11:00:00Z', 'Asia/Singapore'), '2026-10-07T03:00:00.000Z');
  assert.equal(zonedToIso('not a date', 'Asia/Singapore'), undefined);
});

test('HKMA liquidity figures are read from a dated page', () => {
  const day = parseHkmaDailyStats(readFileSync('tests/fixtures/hkma-dms-20261006.html', 'utf8'));
  assert.equal(day?.date, '2026-10-06');
  assert.ok(day && day.closingBalance > 0);
});

test('HKMA weekend pages have no figures', () => {
  assert.equal(parseHkmaDailyStats(readFileSync('tests/fixtures/hkma-dms-20261003-weekend.html', 'utf8')), null);
});

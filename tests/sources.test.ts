// Each source's parser, run against responses recorded from the real feeds
// (tests/fixtures). A format change on a regulator's site shows up here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

process.env.VERCEL = '1';
delete process.env.DATABASE_URL;

const fixtures: Record<string, { file: string; contentType: string }> = JSON.parse(readFileSync('tests/fixtures/index.json', 'utf8'));

// The Federal Register, MAS and SGX put the item limit in the URL; the recorded
// response holds more items than any test asks for, so the limit is ignored
const withoutLimit = (url: string) =>
  url.replace(/([?&])(per_page|rows)=\d+/g, '$1$2=N').replace(/%22limit%22%3A\d+/g, '%22limit%22%3AN');
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

const { SOURCES, zonedToIso, parseHkmaDailyStats, sgxPublicUrl, finraTitle } = await import('../server.ts');

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
    const askedForOne = requested.some(url => /[?&](per_page|rows)=1(&|$)|%22limit%22%3A1%2C/.test(url));
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

test('SGX RegCo consultations carry the closing date SGX publishes, as a Singapore date', async () => {
  const notices = await byName('SGX RegCo Consultations').fetch();
  const value = notices.find(n => /Value Creation and Investor Engagement/.test(n.title));
  assert.equal(value?.statutoryDeadline, 'Comments closed: 2026-05-22');
  assert.equal(value?.publishedAt, '2026-04-21T16:00:00.000Z');
  assert.match(String(value?.dossierUrl), /^https:\/\/regco\.sgx\.com\/public-consultations\//);
});

test('SGX content paths map to the public site', () => {
  assert.equal(sgxPublicUrl('/regco/public-disciplinary-actions/x'), 'https://regco.sgx.com/public-disciplinary-actions/x');
  assert.equal(sgxPublicUrl('/sgxgroup/media-centre/y'), 'https://www.sgxgroup.com/media-centre/y');
});

test('SGX announcements are only the regulatory items of the media list', async () => {
  const notices = await byName('SGX RegCo Announcements').fetch(10);
  assert.ok(notices.length > 0);
  assert.ok(notices.every(n => !/welcomes|award|quarterly review|net profit/i.test(n.title)), notices.map(n => n.title).join(' | '));
});

test('SGX disciplinary actions are enforcement', async () => {
  const notices = await byName('SGX RegCo Disciplinary Actions').fetch();
  assert.ok(notices.every(n => n.format === 'Enforcement'));
});

test('ASX consultations: title from the entry, closing date from its text', async () => {
  const notices = await byName('ASX Public Consultations').fetch();
  const clearing = notices.find(n => /ASX Clear \(Futures\) Operating Rules/.test(n.title));
  assert.ok(clearing, notices.map(n => n.title).join(' | '));
  assert.match(clearing!.title, /^ASX published a consultation paper/);
  assert.equal(clearing!.deadlineDate, '2026-10-30');
  assert.equal(clearing!.publishedAt, '2026-09-29T14:00:00.000Z');
  assert.match(String(clearing!.dossierUrl), /\.pdf$/);
  assert.ok(notices.every(n => !/recording/i.test(n.title)));
});

test('JPX rule revisions are dated in Japan time and are not enforcement', async () => {
  const notices = await byName('JPX Rule Revisions').fetch(10);
  const jgb = notices.find(n => /JGB Futures/.test(n.title));
  assert.equal(jgb?.regulator, 'OSE');
  assert.equal(jgb?.publishedAt, '2026-10-06T15:00:00.000Z');
  const enforcementRules = notices.find(n => /^Revisions to Enforcement Rules/.test(n.title));
  assert.equal(enforcementRules?.format, 'Circulars');
});

test('FINRA titles add the opening of FINRA\'s summary to the notice number', () => {
  assert.equal(
    finraTitle('Regulatory Notice 26-16', 'FINRA has amended its TRACE rules to expand the scope. The effective date is August 2, 2027.'),
    'Regulatory Notice 26-16: FINRA has amended its TRACE rules to expand the scope'
  );
  assert.equal(finraTitle('Information Notice 8/3/26', undefined), 'Information Notice 8/3/26');
});

test('FINRA: election notices are left out and "transaction" is not enforcement', async () => {
  const notices = await byName('FINRA Notices').fetch(10);
  assert.ok(notices.every(n => !/^Election Notice/i.test(n.ref.replace(/^FINRA /, ''))));
  const trace = notices.find(n => /TRACE/.test(n.title));
  assert.ok(trace, notices.map(n => n.title).join(' | '));
  assert.notEqual(trace!.format, 'Enforcement');
  assert.match(trace!.title, /^Regulatory Notice 26-16: FINRA has amended its TRACE rules/);
});

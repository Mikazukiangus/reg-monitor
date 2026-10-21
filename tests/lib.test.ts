// Pure helpers shared by the server and the page
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { extractClosingDate } from '../server/document-dates.ts';
import { dedupeByDocument } from '../shared/dedupe.ts';
import { regulatorMatches, ruleMatches } from '../shared/alertRules.ts';
import { linkPairs, relatedOf } from '../shared/related.ts';
import { noticeTimeline } from '../src/lib/timeline.ts';
import { publishedDay } from '../shared/derived.ts';
import { buildIcs } from '../src/lib/ics.ts';
import { defaultViewState, parseViewState, serializeViewState } from '../src/lib/urlState.ts';
import { matchDigest, singaporeDate } from '../server/digest/match.ts';

test('closing dates are found only in sentences that state one', () => {
  assert.equal(extractClosingDate(['Comments should be submitted on or before 9 December 2026.'])?.date, '2026-12-09');
  assert.equal(extractClosingDate(['The consultation closes on Friday 9 January 2027.'])?.date, '2027-01-09');
  assert.equal(extractClosingDate(['Published on 3 October 2026; responses are invited by 15 November 2026.'])?.date, '2026-11-15');
  assert.equal(extractClosingDate(['The closing date for submissions is 30 November 2026.'])?.date, '2026-11-30');
  assert.equal(extractClosingDate(['The public consultation commences today and will last until 7 October 2026.'])?.date, '2026-10-07');
  assert.equal(extractClosingDate(['MAS met industry on 4 October 2026.']), undefined);
});

const rule = { id: 'r', name: 'r', jurisdictions: ['SFC', 'SEC'], minImpact: 7, keywords: ['fine', 'tokenis'], enabled: true };

test('rules match regulator, impact and keywords at word starts', () => {
  assert.ok(ruleMatches(rule, { regulator: 'SFC', impactScore: 8, title: 'SFC fines a broker' }));
  assert.ok(ruleMatches(rule, { regulator: 'US SEC', impactScore: 8, title: 'Tokenisation of funds' }));
  assert.ok(!ruleMatches(rule, { regulator: 'SFC', impactScore: 8, title: 'Terms as defined in the rules' }));
  assert.ok(!ruleMatches(rule, { regulator: 'MAS', impactScore: 8, title: 'MAS fines a bank' }));
  assert.ok(!ruleMatches(rule, { regulator: 'SFC', impactScore: 6, title: 'SFC fines a broker' }));
  assert.ok(ruleMatches(rule, { regulator: 'SFC', impactScore: 8, title: 'Update', keyPoints: { points: ['The fine was HK$7 million.'] } }));
});

test("a rule's regulator matches whole words of the notice's regulator, not part of a word", () => {
  assert.ok(regulatorMatches('SEC', 'US SEC'));
  assert.ok(regulatorMatches('sgx', 'SGX RegCo'));
  assert.ok(regulatorMatches('PRA', 'UK PRA'));
  assert.ok(regulatorMatches('SC Malaysia', 'SC Malaysia'));
  assert.ok(regulatorMatches(' sc  malaysia ', 'SC Malaysia'));
  assert.ok(regulatorMatches('CPPA', 'CalPrivacy (CPPA)'));
  assert.ok(regulatorMatches('AI Security Institute', 'UK AI Security Institute'));
  // Part of a word is not a match
  assert.ok(!regulatorMatches('SEC', 'UK AI Security Institute'));
  assert.ok(!regulatorMatches('EC', 'US SEC'));
  assert.ok(!regulatorMatches('FTC', 'US CFTC'));
  assert.ok(!regulatorMatches('SC', 'ASIC'));
  // Names with regular-expression characters are taken literally
  assert.ok(regulatorMatches('CalPrivacy (CPPA)', 'CalPrivacy (CPPA)'));
  assert.ok(!regulatorMatches('C.TC', 'US CFTC'));
  assert.ok(!regulatorMatches('', 'US SEC'));
  assert.ok(!ruleMatches(rule, { regulator: 'UK AI Security Institute', impactScore: 8, title: 'Institute fines a lab' }));
});

test('a conclusion is linked to its consultation by regulator and title', () => {
  const consultation = { id: 'c', regulator: 'MAS', format: 'Consultations', title: 'Consultation Paper on Proposed Changes to the Group Capital Framework for Insurers', publishedAt: '2026-03-01T00:00:00Z' };
  const other = { id: 'o', regulator: 'MAS', format: 'Consultations', title: 'Consultation on Stablecoin Reserve Requirements', publishedAt: '2026-03-01T00:00:00Z' };
  const elsewhere = { id: 'e', regulator: 'SFC', format: 'Consultations', title: 'Consultation on Changes to the Group Capital Framework for Insurers', publishedAt: '2026-03-01T00:00:00Z' };
  const response = { id: 'r', regulator: 'MAS', format: 'Circulars', title: 'MAS Response to the Consultation Paper on Changes to the Group Capital Framework for Insurers', publishedAt: '2026-09-04T00:00:00Z' };
  const notices = [consultation, other, elsewhere, response];
  const pairs = linkPairs(notices);
  assert.deepEqual(pairs.map(p => [p.consultationId, p.conclusionId]), [['c', 'r']]);
  const byId = new Map(notices.map(n => [n.id, n]));
  assert.deepEqual(relatedOf('r', pairs, byId).map(l => [l.id, l.relation]), [['c', 'consultation']]);
  assert.deepEqual(relatedOf('c', pairs, byId).map(l => [l.id, l.relation]), [['r', 'conclusion']]);
  assert.deepEqual(relatedOf('o', pairs, byId), []);
  // A conclusion published before the consultation is not its conclusion
  assert.deepEqual(linkPairs([{ ...consultation, publishedAt: '2026-12-01T00:00:00Z' }, response]), []);
  // Only the pairs that include given notices
  assert.deepEqual(linkPairs(notices, new Set(['o'])), []);
});

test('outcomes are read from the ways regulators word them, and events are not outcomes', () => {
  const consultation = (id: string, regulator: string, title: string) => ({ id, regulator, format: 'Consultations', title, publishedAt: '2026-01-01T00:00:00Z' });
  const outcome = (id: string, regulator: string, title: string) => ({ id, regulator, format: 'Announcements', title, publishedAt: '2026-06-01T00:00:00Z' });
  const pairs = linkPairs([
    consultation('pra-cp', 'UK PRA', 'CP6/26 – High loan to income lending'),
    outcome('pra-ps', 'UK PRA', 'PS19/26 – High loan to income lending'),
    consultation('sfc-c', 'SFC', 'SFC and HKMA jointly consult on standard calculation periods under OTC derivative Clearing Rules'),
    outcome('sfc-o', 'SFC', 'SFC and HKMA conclude joint consultation on amendments to Clearing Rules for over-the-counter derivative transactions'),
    consultation('asx-c', 'ASX', 'ASX released a consultation paper titled ASX Clear Third Party Clearing Capital Requirements and Other Proposed Amendments'),
    outcome('asx-o', 'ASX', 'ASX released its response paper on the January 2026 ASX Clear Third Party Clearing Capital Requirements and Other Proposed Amendments consultation paper'),
    consultation('jc3-c', 'BNM', 'Consultation on the Journey to Zero climate commitment'),
    outcome('jc3-o', 'BNM', 'JC3 Journey to Zero Conference 2026 concludes with shared commitment to translate climate ambition')
  ]);
  assert.deepEqual(pairs.map(p => p.conclusionId).sort(), ['asx-o', 'pra-ps', 'sfc-o']);
});

// Pairs labelled by reading the titles of 727 production notices
// (tests/fixtures/related-sample.json). Every link made must be labelled:
// when a rule change finds a new one, check it and add it to the fixture.
test('on production notices, every labelled pair links and nothing else does', () => {
  const sample: { linked: [string, string][]; notLinked: { consultationId: string; conclusionId: string }[]; notices: any[] } =
    JSON.parse(readFileSync('tests/fixtures/related-sample.json', 'utf8'));
  const made = linkPairs(sample.notices).map(p => `${p.consultationId} <- ${p.conclusionId}`).sort();
  assert.deepEqual(made, sample.linked.map(([c, k]) => `${c} <- ${k}`).sort());
  for (const n of sample.notLinked) assert.ok(!made.includes(`${n.consultationId} <- ${n.conclusionId}`));
});

test('publication days are the days the regulators give', () => {
  // Date-only values, stored at midnight in the source's zone, UTC or Singapore
  assert.equal(publishedDay('2026-09-29T14:00:00.000Z', 'AU'), '2026-09-30'); // ASX, Sydney
  assert.equal(publishedDay('2026-10-14T15:00:00.000Z', 'JP'), '2026-10-15'); // JFSA, Tokyo
  assert.equal(publishedDay('2026-10-14T16:00:00.000Z', 'HK'), '2026-10-15'); // HKMA
  assert.equal(publishedDay('2026-10-14T16:00:00.000Z', 'US'), '2026-10-15'); // FINRA, stored at Singapore midnight
  assert.equal(publishedDay('2026-10-07T00:00:00.000Z', 'US'), '2026-10-07'); // Federal Register
  assert.equal(publishedDay('2026-10-14T23:00:00.000Z', 'UK_EU'), '2026-10-15'); // ICO, London
  assert.equal(publishedDay('2026-10-14T22:00:00.000Z', 'UK_EU'), '2026-10-15'); // European Commission, Brussels
  // Full timestamps: the source's own day
  assert.equal(publishedDay('2026-10-15T23:01:39.000Z', 'US'), '2026-10-15'); // 7 pm in New York
  assert.equal(publishedDay('2026-10-15T21:30:00.000Z', 'AU'), '2026-10-16'); // 8.30 am in Sydney
  assert.equal(publishedDay('not a date', 'SG'), undefined);
});

test('the timeline lists only dates the feed or the document gives, in order', () => {
  const steps = noticeTimeline({
    jurisdictionCode: 'SG',
    publishedAt: '2026-10-02T03:00:00Z',
    statutoryDeadline: 'Comments close: 2026-11-15',
    deadlineDate: '2026-11-15',
    keyPoints: {
      points: [], facts: [], refs: [], method: 'extractive',
      dates: [
        { kind: 'takesEffect', date: '2027-01-01', text: 'The rules will take effect on 1 January 2027.' },
        { kind: 'closes', date: '2026-11-15', text: 'Responses are invited by 15 November 2026.' },
        { kind: 'closes', date: '2026-10-30', text: 'The earlier consultation closes on 30 October 2026.', general: true }
      ]
    },
    related: [{ id: 'c', title: 'Consultation on X', relation: 'conclusion', publishedAt: '2027-03-01T00:00:00Z' }]
  });
  assert.deepEqual(steps.map(s => [s.label, s.date]), [
    ['Published', '2026-10-02'],
    ['Comments close', '2026-11-15'],
    ['Takes effect', '2027-01-01'],
    ['Conclusions published', '2027-03-01']
  ]);
  assert.equal(steps[1].quote, 'Responses are invited by 15 November 2026.');
  assert.equal(steps[3].relatedId, 'c');
  // Only a publication date: nothing else is invented
  assert.deepEqual(noticeTimeline({ jurisdictionCode: 'SG', publishedAt: '2026-10-02T03:00:00Z' }).map(s => s.label), ['Published']);
  // A key date without a document sentence keeps the feed's label
  assert.deepEqual(noticeTimeline({ jurisdictionCode: 'SG', deadlineDate: '2026-12-01', statutoryDeadline: 'Effective: 2026-12-01' }).map(s => s.label), ['Effective']);
});

test('calendar files fold long lines at 75 octets', () => {
  const notice: any = {
    id: 'x', regulator: 'MAS', ref: 'MAS Consultations', title: 'A very long title '.repeat(10),
    deadlineDate: '2099-01-31', statutoryDeadline: 'Comments close: 2099-01-31', dossierUrl: 'https://www.mas.gov.sg/x'
  };
  const ics = buildIcs([notice], new Date('2026-10-07T00:00:00Z'));
  assert.ok(ics.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75));
  assert.match(ics, /DTSTART;VALUE=DATE:20990131/);
  assert.match(ics, /DTEND;VALUE=DATE:20990201/);
});

test('view state survives a round trip through the URL', () => {
  const state = { ...defaultViewState(), tab: 'radar' as const, search: 'stablecoin', sort: 'Highest Impact Score' as const, onlyNew: true, noticeId: 'mas-x' };
  state.jurisdictions.US = false;
  assert.deepEqual(parseViewState(serializeViewState(state)), state);
  assert.equal(serializeViewState(defaultViewState()), '');
});

test('the digest covers one Singapore day', () => {
  assert.equal(singaporeDate(new Date('2026-10-06T16:30:00Z')), '2026-10-07');
  const notices = [
    { id: 'a', ref: 'a', regulator: 'SFC', impactScore: 8, title: 'SFC fines a broker', publishedAt: '2026-10-06T15:00:00Z' },
    { id: 'b', ref: 'b', regulator: 'SFC', impactScore: 8, title: 'SFC fines another broker', publishedAt: '2026-10-06T16:30:00Z' }
  ];
  assert.deepEqual(matchDigest(notices, [rule], '2026-10-06').map(m => m.notice.id), ['a']);
});

test('a document listed in two feeds is kept once, as the consultation', () => {
  const url = 'https://apps.sfc.hk/edistributionWeb/gateway/EN/news-and-announcements/news/doc?refNo=26PR161';
  const out = dedupeByDocument([
    { id: 'sfc-pr-26PR161', format: 'Circulars', dossierUrl: url, keyPoints: { points: ['quoted'] } },
    { id: 'other', format: 'Circulars', dossierUrl: 'https://example.org/a' },
    { id: 'sfc-con-26PR161', format: 'Consultations', dossierUrl: url + '#top' },
    { id: 'no-link', format: 'Circulars' }
  ]);
  assert.deepEqual(out.map(n => n.id), ['sfc-con-26PR161', 'other', 'no-link']);
  assert.deepEqual(out[0].keyPoints, { points: ['quoted'] });
  // Different refNo values are different documents
  assert.equal(dedupeByDocument([
    { id: 'a', format: 'Circulars', dossierUrl: url },
    { id: 'b', format: 'Circulars', dossierUrl: url.replace('26PR161', '26PR160') }
  ]).length, 2);
});

// Vercel runs the server as plain Node modules, which need the ".js" on every
// relative import that survives compilation; tsx and Vite don't, so a missing
// one only shows up as a crash on the deployed site
test('every module the server loads uses .js on its relative imports', () => {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/^import\s+(?!type\b)[^'"]*from\s+'(\.{1,2}\/[^']+)'/gm)) {
      assert.match(m[1], /\.js$/, `${file} imports '${m[1]}' without .js`);
      visit(path.join(path.dirname(file), m[1].replace(/\.js$/, '.ts')));
    }
  };
  visit('api/index.ts');
  assert.ok(seen.has(path.join('shared', 'impact.ts')), 'the walk reached shared/');
});

// Icon names in the page's source: the text of each icon span, names chosen
// in the span ({done ? 'check' : 'content_copy'}), and names in icon fields or
// icon tables that a span shows ({tab.icon}, {ICON[choice]}). A span whose name
// comes from anywhere else is reported, so its icons can be added here.
function iconNamesInSource(dir = 'src', unknown: string[] = []): Set<string> {
  const names = new Set<string>();
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry);
    if (statSync(file).isDirectory()) {
      iconNamesInSource(file, unknown).forEach(n => names.add(n));
      continue;
    }
    if (!/\.tsx?$/.test(file)) continue;
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/material-symbols-outlined[^>]*>([\s\S]*?)<\/span>/g)) {
      const body = m[1];
      const plain = body.replace(/\{[\s\S]*\}/g, '').trim();
      if (/^[a-z][a-z0-9_]*$/.test(plain)) names.add(plain);
      // Not the values compared against ({type === 'action' ? ...})
      const chosen = [...body.replace(/===?\s*'[^']*'/g, '').matchAll(/'([a-z][a-z0-9_]*)'/g)].map(l => l[1]);
      chosen.forEach(n => names.add(n));
      if (/\{/.test(body) && !chosen.length && !/\.icon\b|\bICON\w*\[/.test(body)) unknown.push(`${file}: ${body.trim()}`);
    }
    for (const m of source.matchAll(/\bicon: '([a-z][a-z0-9_]*)'/g)) names.add(m[1]);
    for (const table of source.matchAll(/const \w*ICON\w*[^=]*=\s*\{([^}]*)\}/g)) {
      for (const m of table[1].matchAll(/'([a-z][a-z0-9_]*)'/g)) names.add(m[1]);
    }
  }
  return names;
}

test('the icon font holds every icon the page uses, listed in order', () => {
  const html = readFileSync('index.html', 'utf8');
  const listed = decodeURIComponent(html.match(/icon_names=([^&"]+)/)?.[1] || '').split(',');
  assert.deepEqual(listed, [...listed].sort(), 'Google Fonts needs icon_names in alphabetical order');
  const unknown: string[] = [];
  const missing = [...iconNamesInSource('src', unknown)].filter(n => !listed.includes(n));
  assert.deepEqual(unknown, [], 'icon names chosen in a way this test cannot read');
  assert.deepEqual(missing, [], 'add these to icon_names in index.html');
});

test('the security policy allows the page\'s one inline script, and no others', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const headers: { key: string; value: string }[] = vercel.headers.find((h: any) => h.source === '/(.*)').headers;
  const csp = headers.find(h => h.key === 'Content-Security-Policy')!.value;
  const scripts = [...readFileSync('index.html', 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const hashes = scripts.map(s => `'sha256-${createHash('sha256').update(s).digest('base64')}'`);
  const scriptSrc = csp.split('; ').find(d => d.startsWith('script-src '))!.split(' ').slice(1);
  assert.deepEqual(scriptSrc, ["'self'", ...hashes], 'update the hash in vercel.json after editing the inline script in index.html');
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal(headers.find(h => h.key === 'X-Content-Type-Options')?.value, 'nosniff');
});

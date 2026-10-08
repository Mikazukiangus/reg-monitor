// Pure helpers shared by the server and the page
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import path from 'path';
import { extractClosingDate } from '../summarize.ts';
import { dedupeByDocument } from '../src/lib/dedupe.ts';
import { ruleMatches } from '../src/lib/alertRules.ts';
import { findRelated } from '../src/lib/related.ts';
import { buildIcs } from '../src/lib/ics.ts';
import { defaultViewState, parseViewState, serializeViewState } from '../src/lib/urlState.ts';
import { matchDigest, singaporeDate } from '../digest.ts';

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

test('a conclusion is linked to its consultation by regulator and title', () => {
  const consultation = { id: 'c', regulator: 'MAS', format: 'Consultations', title: 'Consultation Paper on Proposed Changes to the Group Capital Framework for Insurers', publishedAt: '2026-03-01T00:00:00Z' };
  const other = { id: 'o', regulator: 'MAS', format: 'Consultations', title: 'Consultation on Stablecoin Reserve Requirements', publishedAt: '2026-03-01T00:00:00Z' };
  const elsewhere = { id: 'e', regulator: 'SFC', format: 'Consultations', title: 'Consultation on Changes to the Group Capital Framework for Insurers', publishedAt: '2026-03-01T00:00:00Z' };
  const response = { id: 'r', regulator: 'MAS', format: 'Circulars', title: 'MAS Response to the Consultation Paper on Changes to the Group Capital Framework for Insurers', publishedAt: '2026-09-04T00:00:00Z' };
  const links = findRelated(response, [consultation, other, elsewhere]);
  assert.deepEqual(links.map(l => [l.id, l.relation]), [['c', 'consultation']]);
  assert.deepEqual(findRelated(consultation, [response]).map(l => [l.id, l.relation]), [['r', 'conclusion']]);
  // A conclusion published before the consultation is not its conclusion
  assert.deepEqual(findRelated({ ...consultation, publishedAt: '2026-12-01T00:00:00Z' }, [response]), []);
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
  assert.ok(seen.has(path.join('src', 'lib', 'impact.ts')), 'the walk reached src/lib');
});

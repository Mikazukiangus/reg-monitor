// The parsers of the sources that read one reply, run directly on the replies
// recorded in tests/fixtures: nothing is fetched and fetch is not replaced.
// tests/sources.test.ts runs the same sources end to end, through fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import type { NormalizedNotice } from '../server/notice.ts';
import { ASIC_MEDIA_RELEASES, parseAsicMediaReleases } from '../server/sources/asic.ts';
import { BIS_PRESS_RSS, parseBisPressReleases } from '../server/sources/bis.ts';
import { parseFcaFeed } from '../server/sources/fca.ts';
import { FEDERAL_REGISTER_AI, FEDERAL_REGISTER_FTC, FEDERAL_REGISTER_SEC_CFTC, parseFederalRegister, parseFederalRegisterAi, parseFederalRegisterFtc } from '../server/sources/federal-register.ts';
import { GOV_UK_AI, parseUkAiPolicy } from '../server/sources/gov-uk.ts';
import { COLORADO_AG_AI_RULEMAKING, parseColoradoAiRulemaking } from '../server/sources/us-feeds.ts';
import { documentDates } from '../server/document-dates.ts';
import { withKeyPoints } from '../server/enrich.ts';
import { keyDate } from '../shared/keyDate.ts';
import { HKMA_FEEDS, parseHkmaRss } from '../server/sources/hkma.ts';
import { JFSA_RSS, parseJfsaNews } from '../server/sources/jfsa.ts';
import { parseMasConsultations, parseMasMediaReleases, parseMasRegulatoryPublications } from '../server/sources/mas.ts';
import { PRA_RSS, parsePraPublications } from '../server/sources/pra.ts';
import { SFC_FEEDS, SFC_RSS, parseSfcRss } from '../server/sources/sfc.ts';
import { parseSgxConsultations, parseSgxDisciplinaryActions, parseSgxRegulatoryNews } from '../server/sources/sgx.ts';

const fixtures: Record<string, { file: string }> = JSON.parse(readFileSync('tests/fixtures/index.json', 'utf8'));

// The recorded reply to the one request whose address starts with `prefix`
function recorded(prefix: string): string {
  const matches = Object.keys(fixtures).filter(url => url.startsWith(prefix));
  assert.equal(matches.length, 1, `recorded replies for ${prefix}: ${matches.length}`);
  return readFileSync(`tests/fixtures/${fixtures[matches[0]].file}`, 'utf8');
}
const recordedJson = (prefix: string) => JSON.parse(recorded(prefix));

function wellFormed(notices: NormalizedNotice[], regulator: RegExp) {
  assert.ok(notices.length > 0, 'no notices parsed');
  assert.equal(new Set(notices.map(n => n.id)).size, notices.length, 'duplicate ids');
  for (const n of notices) {
    assert.match(n.regulator, regulator);
    assert.ok(n.title.trim().length > 5, `title: ${n.title}`);
    assert.match(String(n.dossierUrl), /^https:\/\//, `link: ${n.dossierUrl}`);
    assert.ok(n.publishedAt && !isNaN(new Date(n.publishedAt).getTime()), `date: ${n.publishedAt}`);
  }
}

test('ASIC: releases from the JSON file, newest first, at most `limit`', () => {
  const items = recordedJson(ASIC_MEDIA_RELEASES);
  const notices = parseAsicMediaReleases(items, 4);
  wellFormed(notices, /^ASIC$/);
  assert.equal(notices.length, 4);
  assert.deepEqual(notices.map(n => n.publishedAt), [...notices.map(n => n.publishedAt)].sort().reverse());
  assert.equal(parseAsicMediaReleases(items, 1).length, 1);
  assert.throws(() => parseAsicMediaReleases({}), /not a list/);
});

test('BIS: RSS 1.0 items, Basel Committee releases under BCBS', () => {
  const notices = parseBisPressReleases(recorded(BIS_PRESS_RSS), 10);
  wellFormed(notices, /^(BIS|BCBS)$/);
  assert.equal(parseBisPressReleases(recorded(BIS_PRESS_RSS), 2).length, 2);
  assert.throws(() => parseBisPressReleases('<html>Just a moment...</html>'), /not an RSS feed/);
});

test('UK FCA: RSS items become notices (the recorded reply is a Cloudflare block, so a sample is used)', () => {
  const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>FCA</title>
    <item><title>FCA fines firm for AML failings</title><link>https://www.fca.org.uk/news/press-releases/fca-fines-firm-aml-failings</link>
      <description>&lt;p&gt;The FCA has fined a firm.&lt;/p&gt;</description><pubDate>Mon, 19 Oct 2026 07:00:00 GMT</pubDate></item>
    <item><title>CP26/30: Consultation on payments rules</title><link>https://www.fca.org.uk/publications/consultation-papers/cp26-30-payments</link>
      <pubDate>Fri, 16 Oct 2026 07:00:00 GMT</pubDate></item>
  </channel></rss>`;
  const notices = parseFcaFeed(rss);
  wellFormed(notices, /^UK FCA$/);
  assert.deepEqual(notices.map(n => n.id), ['fca-fca-fines-firm-aml-failings', 'fca-cp26-30-payments']);
  assert.equal(notices[0].summary, 'The FCA has fined a firm.');
  assert.equal(notices[0].publishedAt, '2026-10-19T07:00:00.000Z');
  assert.equal(notices[1].format, 'Consultations');
  assert.equal(parseFcaFeed(rss, 1).length, 1);
  assert.throws(() => parseFcaFeed(recorded('https://www.fca.org.uk/')), /not an RSS feed/);
});

test('Federal Register: SEC and CFTC documents, and AI documents by title', () => {
  const secCftc = parseFederalRegister(recordedJson(FEDERAL_REGISTER_SEC_CFTC));
  wellFormed(secCftc, /^US (SEC|CFTC)$/);
  assert.ok(secCftc.every(n => n.id.startsWith('fedreg-')));
  const ai = parseFederalRegisterAi(recordedJson(FEDERAL_REGISTER_AI), 40);
  wellFormed(ai, /^(US |NIST)/);
  assert.ok(ai.every(n => n.tags.includes('AI rules')));
  assert.equal(parseFederalRegisterAi(recordedJson(FEDERAL_REGISTER_AI), 2).length, 2);
  assert.deepEqual(parseFederalRegister({}), []);
});

test('Federal Register: the FTC\'s documents on AI or privacy, less notices of its own records', () => {
  const recorded = recordedJson(FEDERAL_REGISTER_FTC);
  const notices = parseFederalRegisterFtc(recorded, 100);
  wellFormed(notices, /^US FTC$/);
  // Of the 100 recorded documents, the one on AI: the policy statement of 7 July 2026
  assert.deepEqual(notices.map(n => n.id), ['fedreg-2026-13628']);
  assert.ok(notices[0].tags.includes('AI rules') && !notices[0].tags.includes('Data privacy'));
  const doc = (title: string, abstract = '') => ({ title, abstract, type: 'Rule', document_number: '2025-1', publication_date: '2025-04-22', html_url: 'https://www.federalregister.gov/d/2025-1' });
  const one = (title: string, abstract?: string) => parseFederalRegisterFtc({ results: [doc(title, abstract)] }, 1);
  assert.deepEqual(one('Children\'s Online Privacy Protection Rule')[0]?.tags.slice(-1), ['Data privacy']);
  assert.deepEqual(one('Privacy Act of 1974; System of Records'), []);
  assert.deepEqual(one('Agency Information Collection Activities; Proposed Collection; Comment Request', 'Health Breach Notification Rule privacy'), []);
  assert.deepEqual(one('Telemarketing Sales Rule Fees'), []);
  assert.deepEqual(parseFederalRegisterFtc({}), []);
});

test('Federal Register AI documents are named by the most specific agency the Federal Register knows', () => {
  const doc = (agencies: object[]) => ({ results: [{
    title: 'Request for Information: Accelerating the Adoption and Use of Artificial Intelligence as Part of Clinical Care',
    type: 'Notice', document_number: '2025-23641', publication_date: '2025-12-23',
    html_url: 'https://www.federalregister.gov/d/2025-23641', agencies
  }] });
  const regulator = (agencies: object[]) => parseFederalRegisterAi(doc(agencies), 1)[0]?.regulator;
  const hhs = { name: 'Health and Human Services Department', raw_name: 'DEPARTMENT OF HEALTH AND HUMAN SERVICES' };
  // "Office of the Secretary" has only a raw name: the department is named instead
  assert.equal(regulator([hhs, { raw_name: 'Office of the Secretary' }]), 'US Health and Human Services Department');
  assert.equal(regulator([hhs, { name: 'Food and Drug Administration', raw_name: 'Food and Drug Administration' }]), 'US Food and Drug Administration');
  // With no agency the Federal Register knows, the raw name is all there is
  assert.equal(regulator([{ raw_name: 'Office of the Secretary' }]), 'US Office of the Secretary');
  assert.equal(regulator([]), 'US Federal Register');
});

test('GOV.UK: AI policy from DSIT and the AI Security Institute', () => {
  const notices = parseUkAiPolicy(recordedJson(GOV_UK_AI), 40);
  wellFormed(notices, /^UK (DSIT|AI Security Institute)$/);
  assert.ok(notices.every(n => n.dossierUrl?.startsWith('https://www.gov.uk/')));
  assert.deepEqual(parseUkAiPolicy({ results: [] }), []);
});

test('HKMA: each feed, less routine market releases', () => {
  for (const feed of Object.values(HKMA_FEEDS)) {
    const xml = recorded(`https://www.hkma.gov.hk/eng/other-information/rss/${feed.file}`);
    const notices = parseHkmaRss(xml, feed, 40);
    wellFormed(notices, /^HKMA$/);
    assert.ok(notices.every(n => n.id.startsWith(`${feed.idPrefix}-`) && n.type === feed.type));
    assert.ok(notices.every(n => !/tender (results|information)|exchange fund (bills|notes)/i.test(n.title)));
    assert.equal(parseHkmaRss(xml, feed).length <= feed.limit, true);
  }
  assert.ok(parseHkmaRss(recorded(`https://www.hkma.gov.hk/eng/other-information/rss/${HKMA_FEEDS.consultations.file}`), HKMA_FEEDS.consultations, 40)
    .every(n => n.format === 'Consultations'));
});

test('JFSA: "Category,Title" items, less press conferences and the weekly review', () => {
  const notices = parseJfsaNews(recorded(JFSA_RSS), 40);
  wellFormed(notices, /^JFSA$/);
  assert.ok(notices.every(n => n.type !== 'PRESS CONFERENCES' && !/^FSA Weekly Review/i.test(n.title)));
});

test('MAS: media releases, consultations, circulars and guidelines from the search API', () => {
  const media = parseMasMediaReleases(recordedJson('https://www.mas.gov.sg/api/v1/search?q=*%3A*&fq=mas_contenttype_s%3A%28%22Media+Releases'));
  wellFormed(media, /^MAS$/);
  const consultations = parseMasConsultations(recordedJson('https://www.mas.gov.sg/api/v1/search?q=*%3A*&fq=mas_contenttype_s%3A%28%22Consultations'));
  wellFormed(consultations, /^MAS$/);
  assert.ok(consultations.every(n => n.format === 'Consultations'));
  const publications = parseMasRegulatoryPublications(recordedJson('https://www.mas.gov.sg/api/v1/search?q=*%3A*&fq=mas_contenttype_s%3A%28%22Circulars'));
  wellFormed(publications, /^MAS$/);
  assert.ok(publications.every(n => n.format === 'Circulars' || n.format === 'Guidelines'));
  assert.deepEqual(parseMasMediaReleases({}), []);
});

test('PRA: Bank of England publications', () => {
  const notices = parsePraPublications(recorded(PRA_RSS), 40);
  wellFormed(notices, /^UK PRA$/);
  assert.equal(parsePraPublications(recorded(PRA_RSS), 1).length, 1);
});

test('SFC: each feed', () => {
  for (const feed of Object.values(SFC_FEEDS)) {
    const notices = parseSfcRss(recorded(`${SFC_RSS}/${feed.path}`), feed, 40);
    wellFormed(notices, /^SFC$/);
    assert.ok(notices.every(n => n.id.startsWith(`${feed.idPrefix}-`)));
    // Circular titles drop the audience line
    assert.ok(notices.every(n => !n.title.includes('\n')));
  }
});

test('SGX RegCo: consultations, disciplinary actions and regulatory news from the content API', () => {
  const api = 'https://api2.sgx.com/regco/content-api?queryId=e4da21521b39e5324f96273260acfd8e1a9d1e5e%3A';
  const consultations = parseSgxConsultations(recordedJson(`${api}public_consultations_list`).data);
  wellFormed(consultations, /^SGX RegCo$/);
  const actions = parseSgxDisciplinaryActions(recordedJson(`${api}public_disciplinary_actions_list`).data);
  wellFormed(actions, /^SGX RegCo$/);
  assert.ok(actions.every(n => n.format === 'Enforcement'));
  const news = parseSgxRegulatoryNews(recordedJson(`${api}media_centre_list`).data, 40);
  wellFormed(news, /^SGX RegCo$/);
  assert.deepEqual(parseSgxConsultations(null), []);
});

test('Colorado AG AI Rulemaking: the rulemaking page, one notice per revision', () => {
  const pages = recordedJson(COLORADO_AG_AI_RULEMAKING);
  const [notice] = parseColoradoAiRulemaking(pages);
  wellFormed([notice], /^Colorado AG$/);
  assert.equal(notice.id, 'coag-ai-rulemaking-20261008155835');
  assert.equal(notice.title, 'Colorado Automated Decision-Making Technology & Chatbot Safety Rulemaking');
  assert.equal(notice.dossierUrl, 'https://coag.gov/ai/');
  // When the page last changed (WordPress gives GMT without a zone)
  assert.equal(notice.publishedAt, '2026-10-08T15:58:35.000Z');
  assert.equal(notice.format, 'Consultations');
  assert.ok(notice.tags.includes('AI rules'));
  // The excerpt's last, cut-off sentence is left out
  assert.match(notice.summary!, /^In 2024, the Colorado General Assembly passed .* high-risk artificial intelligence systems\.$/);

  // A later revision is a new notice; the same revision keeps its id
  const revised = parseColoradoAiRulemaking([{ ...pages[0], modified_gmt: '2026-10-27T09:00:00' }]);
  assert.equal(revised[0].id, 'coag-ai-rulemaking-20261027090000');
  assert.equal(parseColoradoAiRulemaking(pages)[0].id, notice.id);

  // An excerpt WordPress did not cut is kept whole
  const whole = parseColoradoAiRulemaking([{ ...pages[0], excerpt: { rendered: '<p>Comments are invited on the draft rules.</p>' } }]);
  assert.equal(whole[0].summary, 'Comments are invited on the draft rules.');

  // A page that moved or went is an error, not a quiet week
  assert.throws(() => parseColoradoAiRulemaking([]), /Rulemaking page not found/);
  assert.throws(() => parseColoradoAiRulemaking({ code: 'rest_no_route' }), /Rulemaking page not found/);
});

test('Colorado AG AI Rulemaking: the page\'s comment deadline is the date the notice shows', () => {
  const [notice] = parseColoradoAiRulemaking(recordedJson(COLORADO_AG_AI_RULEMAKING));
  // Sentences from the page (21 October 2026), as its key points quote them
  const sentence = 'In drafting the final set of rules, the Office will consider all written comments received on or before October 26, 2026 at 11:59 P.M.';
  const points = ['The ADMT Act requires the Colorado Attorney General’s Office to adopt rules to clarify and implement specific provisions of the law before January 1, 2027.', sentence];
  const dated = withKeyPoints(notice, { points, facts: points.map(text => ({ text })), refs: [], method: 'extractive', dates: documentDates(points) });
  assert.equal(keyDate(dated, '2026-10-21')?.text, 'Comments close: 2026-10-26');
  assert.equal(keyDate(dated, '2026-10-21')?.quote, sentence);
  assert.equal(keyDate(dated, '2026-10-27')?.text, 'Comments closed: 2026-10-26');
});

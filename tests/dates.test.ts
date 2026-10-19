// Dates a notice shows: which sentence of the document a date comes from, what
// kind of date it is, and whether it belongs to this notice. The sentences are
// from real notices; several were once given the wrong date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentDates, extractClosingDate, pagePublishedDate } from '../summarize.ts';
import type { DateKind } from '../src/types/regulatory.ts';
import { assessImpact } from '../src/lib/impact.ts';

process.env.VERCEL = '1';
delete process.env.DATABASE_URL;
const { noticeDate, fromArchive } = await import('../server.ts');

// [sentence, kind, date, stated generally] or [sentence] when it gives no date
const SENTENCES: [string, DateKind?, string?, boolean?][] = [
  // Requests for comments
  ['The FCA is asking for feedback on the proposals by 11 December 2026.', 'closes', '2026-12-11'],
  ['Submissions should be sent to markets.consultation@asic.gov.au by 5pm (AEDT) on 5 November 2026.', 'closes', '2026-11-05'],
  ['Stakeholders are invited to respond to the consultation by 9 November 2026.', 'closes', '2026-11-09'],
  ['Comments may be submitted via the FormSG link by 9 December 2026.', 'closes', '2026-12-09'],
  ['Comments should be received on or before December 7, 2026.', 'closes', '2026-12-07'],
  ['Stakeholders are invited to submit their contributions through ESMA’s consultation webpage by 15 January 2027.', 'closes', '2027-01-15'],
  ['All submissions should refer to file number SR-NASDAQ-2026-080 and should be submitted on or before October 29, 2026.', 'closes', '2026-10-29'],
  ["I would be grateful if the Association's comments on the proposed amendment, as set out above, could reach us by 30 June 2026.", 'closes', '2026-06-30'],
  ['Written submissions are requested by Friday 28th February 2020.', 'closes', '2020-02-28'],
  ['Responses to the discussion paper are requested by Tuesday, 16 September 2025.', 'closes', '2025-09-16'],
  // Statements of when comments close
  ['This consultation closes at 11.59 PM on 09 December 2026.', 'closes', '2026-12-09'],
  ['The public consultation commences today and will last until 7 October 2026.', 'closes', '2026-10-07'],
  ['The consultation closes on 14 October 2026.', 'closes', '2026-10-14', true],
  ['The consultation period ends on Monday, 30 November 2026.', 'closes', '2026-11-30', true],
  ['The PRA AR was published on 25 June 2026 and the closing date for receiving representations on the AR was 25 September 2026.', 'closes', '2026-09-25', true],
  // Taking effect
  ['These four revised codes will be gazetted on 16 October 2026 and become effective on 1 November 2026.', 'takesEffect', '2026-11-01'],
  ['The Guidelines will take effect on 07 October 2027.', 'takesEffect', '2027-10-07'],
  ['This revision will take effect on December 15, 2026 (for more details, please refer to "Revisions to Rules and Regulations: Tracked Changes").', 'takesEffect', '2026-12-15'],
  ['The effective date of the amendments by which compliance is mandatory is August 2, 2027.', 'takesEffect', '2027-08-02'],
  ['The changes, which take effect on 1 January 2027, are meant to foster a value creation culture among listed issuers.', 'takesEffect', '2027-01-01'],
  ['The requirement for Group 1 applicable entities will now take effect for annual reporting periods beginning on or after 1 January 2028, instead of 1 January 2027.', 'takesEffect', '2028-01-01'],
  ['The Monetary Authority of Singapore (MAS) announced changes to its senior management team, which will take effect on 1 November 2026.', 'takesEffect', '2026-11-01'],
  // Complying by
  ['To facilitate and guide their transition planning, AIs should have transition planning documentation in place by 1 July 2030.', 'complyBy', '2030-07-01'],
  ['The 2026 Regulatory Element courses have been assigned and are required to be completed by December 31, 2026.', 'complyBy', '2026-12-31'],
  ['FIs may implement the Guidelines in phases: they should meet the expectations set out in Sections 3 to 4 from 07 October 2027, and Sections 5 and 6 by 07 October 2028.', 'complyBy', '2028-10-07'],
  // No date for the document: proposals, conditions, bans, other events
  ['Respondents expressed differing views on the proposed 21 October 2026 commencement date.'],
  ['Mr Ma is disqualified from managing corporations until 21 September 2030.'],
  ['In scope thresholds would be adjusted to reflect cumulative growth in nominal GDP, with the first update effective from 1 July 2031, and further updates every five years.'],
  ['If the market supports the changes, they are expected to be implemented in phases from 1 January 2027.'],
  ['However, if OSE deems it inappropriate to implement the revision on December 15, 2026 due to problems with operating the trading system or any other unavoidable reasons, it will be implemented on a later date specified by OSE.'],
  ['The Single Submission Arrangement brings into operation the simplified dual IPO listing framework set out in the Memorandum of Understanding (MoU) signed by the two regulators on 23 July 2026.'],
  ['The European Securities and Markets Authority (ESMA) has published today a statement clarifying that EU market participants should not be prevented from accessing third-country Central Securities Depositories (CSDs) beyond 17 January 2027 and until the EU finalises the legislation.'],
  ['The policy will apply to reporting reference dates falling on or after 31 December 2026.'],
  ['MAS met industry on 4 October 2026.'],
  // Chinese rules (CAC) and Japanese calls for comments (Cabinet Office)
  ['《人工智能拟人化互动服务管理暂行办法》已经2026年2月2日国家互联网信息办公室2026年第3次室务会会议审议通过，并经国家发展和改革委员会、工业和信息化部、公安部、国家市场监督管理总局同意，现予公布，自2026年7月15日起施行。', 'takesEffect', '2026-07-15'],
  ['第三十二条 本办法自2026年7月15日起施行。', 'takesEffect', '2026-07-15'],
  ['意见反馈截止时间为2026年10月18日。', 'closes', '2026-10-18'],
  ['第二十条 本办法自2027年1月1日起施行。（征求意见稿）'],
  ['人工知能基本計画の改定に向け、人工知能基本計画（素案）について、令和８年６月19日（金）から令和８年６月23日（火）までの間、意見を募集します。', 'closes', '2026-06-23'],
  ['政府は、人工知能関連技術の研究開発及び活用の推進に関する法律（令和７年法律第53号）に基づき、我が国初の人工知能基本計画を令和７年12月23日に閣議決定したところです。']
];

for (const [sentence, kind, date, general] of SENTENCES) {
  test(`date: ${sentence.slice(0, 70)}`, () => {
    const found = documentDates([sentence])[0];
    assert.deepEqual(
      found && [found.kind, found.date, !!found.general],
      kind && [kind, date, !!general]
    );
  });
}

test('the first closing date in a list of sentences, for ASX entries', () => {
  const closing = extractClosingDate(['On Tuesday 29 September 2026, ASX published a consultation paper.', 'Written submissions are requested by 30 October 2026.']);
  assert.equal(closing?.date, '2026-10-30');
});

const TODAY = '2026-10-08';
const dates = (...sentences: string[]) => documentDates(sentences);
const shown = (type: string, title: string, sentences: string[]) => noticeDate({ type, title }, dates(...sentences), TODAY)?.statutoryDeadline;

test('a closing date stated generally counts only on a consultation', () => {
  // The PRA roundtable notice quotes the closing date of the paper it discussed
  assert.equal(shown('CIRCULARS', 'The PRA held a captive insurance industry roundtable', ['The consultation closes on 14 October 2026.']), undefined);
  assert.equal(shown('REGULATORY ANNOUNCEMENT', 'Exchange Publishes Consultation Paper on Phase II of Listing Framework Competitiveness Review', ['The consultation period ends on Monday, 30 November 2026.']), 'Comments close: 2026-11-30');
  // A request for comments counts on any notice
  assert.equal(shown('CIRCULARS', 'New rules to make long-term investment funds clearer', ['The FCA is asking for feedback on the proposals by 11 December 2026.']), 'Comments close: 2026-12-11');
});

test('a round-up shows none of the dates of the papers it lists', () => {
  assert.equal(shown('CIRCULARS', 'PRA Regulatory Digest – September 2026', [
    'The Bank of England Banking taxonomy v4.1.1 will take effect from Friday 1 January 2027.',
    'The consultation closes on 14 October 2026.'
  ]), undefined);
});

test('a consultation shows when comments close, never a proposed effective date', () => {
  assert.equal(shown('CONSULTATIONS', 'CP13/26 – The Prudential Regulation Authority’s automatic thresholds indexation framework', ['The new framework will take effect on 1 July 2027.']), undefined);
  // Closed: the date stays, but not as an upcoming deadline
  const closed = noticeDate({ type: 'REGULATORY NOTICE', title: 'Regulatory Notice 26-14: FINRA seeks comment on a proposal to modernize Rule 2210' }, dates('Comments must be received by September 11, 2026.'), TODAY);
  assert.equal(closed?.statutoryDeadline, 'Comments closed: 2026-09-11');
  assert.equal(closed?.deadlineDate, undefined);
});

test('otherwise the soonest date it takes effect or must be met, labelled by kind', () => {
  const guidelines = noticeDate({ type: 'MEDIA RELEASE', title: 'MAS Sets Out Supervisory Expectations on Responsible AI Adoption by Financial Institutions' }, dates(
    'FIs may implement the Guidelines in phases: they should meet the expectations set out in Sections 3 to 4 from 07 October 2027, and Sections 5 and 6 by 07 October 2028.',
    'The Guidelines will take effect on 07 October 2027.'
  ), TODAY);
  assert.equal(guidelines?.statutoryDeadline, 'Takes effect: 2027-10-07');
  assert.equal(guidelines?.deadlineDate, '2027-10-07');
  assert.equal(guidelines?.deadlineQuote, 'The Guidelines will take effect on 07 October 2027.');
  assert.equal(guidelines?.statusBadge?.type, 'action');
  assert.equal(shown('MEDIA RELEASE', 'ACSR’s Mandatory Sustainability Assurance Requirement to Take Effect in 2028', [
    'The requirement for Group 1 applicable entities will now take effect for annual reporting periods beginning on or after 1 January 2028, instead of 1 January 2027.'
  ]), 'Takes effect: 2028-01-01');
  assert.equal(shown('CIRCULAR', 'GS-2 Transition Planning', ['To facilitate and guide their transition planning, AIs should have transition planning documentation in place by 1 July 2030.']), 'Comply by: 2030-07-01');
});

test('enforcement actions and responses to feedback get no date from their text', () => {
  assert.equal(shown('ENFORCEMENT ACTION', 'Former Warwick Gold and Impact Gold director Yuetu Ma disqualified from managing corporations for four years', ['Mr Ma is disqualified from managing corporations until 21 September 2030.']), undefined);
  assert.equal(shown('CONSULTATION', 'ASX released its response to feedback received on the consultation on the exposure draft Listing Rules', ['Respondents expressed differing views on the proposed 21 October 2026 commencement date.']), undefined);
});

test('rules stated in the text to take effect within 30 days score as Federal Register ones do', () => {
  const today = new Date(`${TODAY}T05:00:00Z`);
  const text = assessImpact({ format: 'Circulars', type: 'RULE REVISION', title: 'Revisions to the Business Regulations', statutoryDeadline: 'Takes effect: 2026-10-20' }, today);
  const fedreg = assessImpact({ format: 'Circulars', type: 'RULE REVISION', title: 'Revisions to the Business Regulations', statutoryDeadline: 'Effective: 2026-10-20' }, today);
  assert.equal(text.score, 9);
  assert.deepEqual(text.reasons, fedreg.reasons);
  // A date to comply by does not move the score
  assert.equal(assessImpact({ format: 'Circulars', type: 'CIRCULAR', title: 'GS-2 Transition Planning', statutoryDeadline: 'Comply by: 2026-10-20' }, today).score, 5);
});

// Stored copies are re-dated when read. These use dates far ahead, so the
// tests do not depend on today's date.
const stored = (fields: object) => ({
  id: 'x', ref: 'x', regulator: 'UK PRA', jurisdiction: 'UK', jurisdictionCode: 'UK_EU', typeColorClass: { bg: '', text: '' },
  impactScore: 5, issuedTimeAgo: '', tags: [], sector: 'Prudential & Capital', format: 'Circulars', severity: 'info',
  publishedAt: '2026-09-30T00:00:00Z', ...fields
});

test('stored notices drop dates the old rules took from the wrong sentence', () => {
  const roundtable = fromArchive(stored({
    type: 'CIRCULARS', title: 'The PRA held a captive insurance industry roundtable',
    statutoryDeadline: 'Comments close: 2099-10-14', deadlineDate: '2099-10-14',
    statusBadge: { text: 'Comments close: 2099-10-14', type: 'deadline' },
    keyPoints: { points: [], refs: [], method: 'extractive', facts: [{ text: 'The consultation closes on 14 October 2099.', date: '2099-10-14' }], closingDate: { text: 'The consultation closes on 14 October 2099.', date: '2099-10-14' } }
  }));
  assert.equal(roundtable.statutoryDeadline, undefined);
  assert.equal(roundtable.deadlineDate, undefined);
  assert.equal(roundtable.keyPoints?.closingDate, undefined);

  const acsr = fromArchive(stored({
    regulator: 'SC Malaysia', type: 'MEDIA RELEASE', title: 'ACSR’s Mandatory Sustainability Assurance Requirement to Take Effect in 2098',
    statutoryDeadline: 'Date in source: 2098-01-01', deadlineDate: '2098-01-01',
    keyPoints: { points: [], refs: [], method: 'extractive', facts: [{ text: 'The requirement for Group 1 applicable entities will now take effect for annual reporting periods beginning on or after 1 January 2099, instead of 1 January 2098.', date: '2098-01-01' }] }
  }));
  assert.equal(acsr.statutoryDeadline, 'Takes effect: 2099-01-01');
  assert.equal(acsr.deadlineDate, '2099-01-01');
  assert.equal(acsr.keyPoints?.dates?.[0].kind, 'takesEffect');
});

test('stored notices keep the dates their source gave', () => {
  const mas = fromArchive(stored({
    regulator: 'MAS', type: 'CONSULTATION', title: 'Consultation Paper on Amendments to Corporate Governance Regulations',
    statutoryDeadline: 'Comments close: 2099-12-09', deadlineDate: '2099-12-09',
    keyPoints: { points: [], refs: [], method: 'extractive', facts: [] }
  }));
  assert.equal(mas.statutoryDeadline, 'Comments close: 2099-12-09');
  // A source's closing date stored while it was still ahead reads as closed once passed
  const past = fromArchive(stored({
    regulator: 'MAS', type: 'CONSULTATION', title: 'Consultation Paper on Changes to the Group Capital Framework',
    statutoryDeadline: 'Comments close: 2026-01-09', deadlineDate: '2026-01-09'
  }));
  assert.equal(past.statutoryDeadline, 'Comments closed: 2026-01-09');
  assert.equal(past.deadlineDate, undefined);
});

test('a Federal Register notice without a date field takes the one its text states', () => {
  const filing = fromArchive(stored({
    regulator: 'US SEC', type: 'NOTICE', title: 'Self-Regulatory Organizations; The Nasdaq Stock Market LLC; Notice of Filing and Immediate Effectiveness of a Proposed Rule Change',
    statutoryDeadline: 'No date published', statusBadge: { text: 'Published', type: 'standard' },
    keyPoints: { points: [], refs: [], method: 'extractive', facts: [{ text: 'All submissions should refer to file number SR-NASDAQ-2099-080 and should be submitted on or before October 29, 2099.', date: '2099-10-29' }] }
  }));
  assert.equal(filing.statutoryDeadline, 'Comments close: 2099-10-29');
  assert.equal(filing.statusBadge?.type, 'deadline');
});

test('a page states when it was published', () => {
  const now = new Date('2026-10-10T06:00:00Z');
  assert.equal(pagePublishedDate('<meta property="article:published_time" content="2026-10-09T08:30:00+01:00">', now), '2026-10-09T07:30:00.000Z');
  assert.equal(pagePublishedDate('<script type="application/ld+json">{"datePublished": "2026-10-08"}</script>', now), '2026-10-08');
  assert.equal(pagePublishedDate('<p>First published: 09/10/2026</p><p>Last updated: 10/10/2026</p>', now), '2026-10-09');
  assert.equal(pagePublishedDate('<meta name="DC.date.issued" content="2026-10-07">', now), '2026-10-07');
  // No date, or one that is not plausible
  assert.equal(pagePublishedDate('<p>Published in 2026</p>', now), undefined);
  assert.equal(pagePublishedDate('<meta property="article:published_time" content="2027-01-01">', now), undefined);
});

test('a notice from a feed without dates takes the date its page states', () => {
  const n = fromArchive({
    id: 'fca-x', title: 'New rules to make long-term investment funds clearer', regulator: 'UK FCA', type: 'CIRCULARS',
    jurisdiction: 'UNITED KINGDOM', jurisdictionCode: 'UK_EU', impactScore: 5, tags: [], sector: 'Capital Markets & Listings', format: 'Circulars',
    severity: 'info', dossierUrl: 'https://www.fca.org.uk/news/x',
    keyPoints: { points: ['A point.'], facts: [], refs: [], method: 'extractive', published: '2026-10-09' }
  });
  assert.equal(n.publishedAt, '2026-10-09T00:00:00.000Z');
  assert.notEqual(n.issuedTimeAgo, 'Earlier');
});

test('a link-only description from a stored copy is dropped', () => {
  const n = fromArchive({
    id: 'ca-gov-x', title: 'Governor signs AI law', regulator: 'California Governor', type: 'NEWS', summary: 'Source',
    jurisdiction: 'UNITED STATES (CALIFORNIA)', jurisdictionCode: 'US', impactScore: 5, tags: [], sector: 'AI, Cyber & Tech Risk', format: 'Circulars',
    severity: 'info', dossierUrl: 'https://www.gov.ca.gov/x', publishedAt: '2026-09-30T00:00:00.000Z'
  });
  assert.equal(n.summary, undefined);
});

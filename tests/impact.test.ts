// The impact rubric (src/lib/impact.ts), on real notices from the sources.
// Each example gives the score a reader applying the rubric would give.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessImpact, commentsClosed, severityOf } from '../src/lib/impact.ts';
import { classifyFormat } from '../src/lib/tagging.ts';

const TODAY = new Date('2026-10-08T05:00:00Z');

// [type, title, statutoryDeadline, score]
const EXAMPLES: [string, string, string | undefined, number][] = [
  // Routine
  ['PRESS RELEASE', 'Hong Kong’s Latest Foreign Currency Reserve Assets Figures Released', undefined, 3],
  ['PRESS RELEASE', 'International Reserves of Bank Negara Malaysia as at 31 July 2026', undefined, 3],
  ['PRESS RELEASE', 'MAS Announces Senior Leadership Changes', undefined, 3],
  ['SPEECH', 'Keynote by Tan Boon Gin, SGX RegCo CEO, at the Singapore Governance and Transparency Forum 2026', undefined, 3],
  ['PRESS RELEASE', 'HKMA hosts Cargox Solution Day to promote regional trade data connectivity', undefined, 3],
  ['PRESS RELEASE', 'Signing of the Third Bilateral Swap Arrangement between Japan and Malaysia', undefined, 3],
  ['NOTICE', 'Sunshine Act Meetings', undefined, 3],
  ['NOTICE', 'Agency Information Collection Activities; Proposed Collection; Comment Request; Extension: Rule 2a-7', 'Comments close: 2026-11-30', 3],
  ['CIRCULAR', 'PRA Regulatory Digest – September 2026', undefined, 3],
  // SRO filings published by the SEC
  ['NOTICE', 'Self-Regulatory Organizations; Cboe BZX Exchange, Inc.; Notice of Filing and Immediate Effectiveness of a Proposed Rule Change', 'Comments close: 2026-10-20', 4],
  ['NOTICE', 'Self-Regulatory Organizations: MIAX PEARL, LLC; Notice of Filing and Immediate Effectiveness of a Proposed Rule Change', undefined, 4],
  // Consultations, by their closing date
  ['CONSULTATION', 'MAS Consults on Targeted Updates to Corporate Governance Requirements for Banks', undefined, 7],
  ['CONSULTATION', 'Consultation on Proposed Amendments to the Payment Services Act 2019 for Stablecoins Regulation', 'Comments close: 2026-10-16', 8.5],
  ['CONSULTATION', 'Consultation Paper on Enhanced Disclosures: Value Creation and Investor Engagement', 'Comments closed: 2026-05-22', 4],
  ['PROPOSED RULE', 'Investment Adviser Performance-Based Compensation Modernization', 'Comments close: 2026-12-15', 7],
  ['PROPOSED RULE', 'Interval Fund Modernization', 'Comments close: 2026-09-30', 4],
  // Enforcement: the same whoever issues it, however the source labels it
  ['ENFORCEMENT ACTION', 'ASIC sues lead generation business over alleged misleading comparison claims', undefined, 7],
  ['DISCIPLINARY ACTION', 'SGX RegCo reprimands Debao Property Development Limited', undefined, 7],
  ['PRESS RELEASE', 'SC Charges Brothers for Dealing in Securities without Licence', undefined, 7],
  ['DISCIPLINARY ACTION', 'Key Enforcement Actions Taken by MAS in Q3 2026', undefined, 7],
  // Rules made
  ['RULE', 'Adoption of Updated EDGAR Filer Manual', 'Effective: 2026-12-01', 7.5],
  ['RULE', 'Commission Quorum Requirement', 'Effective: 2026-10-20', 9],
  ['CONSULTATION', 'SFC concludes consultation on the investor identification regime for Hong Kong’s exchange-traded derivatives market', undefined, 7.5],
  ['CIRCULAR', 'ID 10/26 MAS Response to the Consultation Paper on Changes to the Group Capital Framework', undefined, 7.5],
  ['REGULATORY NOTICE', 'Regulatory Notice 26-16: FINRA has amended its TRACE rules to expand the scope of the principal transaction indicator', undefined, 7.5],
  ['RULE REVISION', 'Revisions to Securities Listing Regulations in Relation to Revisions to Japan’s Corporate Governance Code', undefined, 7.5],
  ['CIRCULAR', 'PS16/26 – PRA rule changes to accommodate HM Treasury’s Overseas Prudential Requirements Regime', undefined, 7.5],
  // Guidance, technical standards, everything else
  ['GUIDELINES', 'Guidelines on Artificial Intelligence Risk Management for Financial Institutions', undefined, 6.5],
  ['PRESS RELEASE', 'Basel Committee publishes report on information and communication technology risk management', undefined, 5],
  ['TECHNICAL', 'Global standard-setting bodies publish a toolkit for cyber resilience at FMIs', undefined, 6],
  ['PRESS RELEASE', 'Monetary Policy Statement', undefined, 5],
  ['CIRCULAR', 'Circular on Private Market Investments', undefined, 5],
  ['NOTICE', 'Information Notice 8/3/26: FINRA is providing information in this Notice to remind registered persons of proposed changes', undefined, 5]
];

for (const [type, title, deadline, expected] of EXAMPLES) {
  test(`impact: ${title.slice(0, 70)}`, () => {
    const { format } = classifyFormat(type, title);
    const result = assessImpact({ format, type, title, statutoryDeadline: deadline }, TODAY);
    assert.equal(result.score, expected, `${result.score} (${result.reasons.join('; ')})`);
    assert.equal(result.severity, severityOf(expected));
    assert.ok(result.reasons.length > 0 && result.reasons.every(r => /: [+]?\d/.test(r)), 'each reason gives its points');
  });
}

test('critical needs a date close at hand', () => {
  for (const [type, title, deadline] of EXAMPLES) {
    const { format } = classifyFormat(type, title);
    if (assessImpact({ format, type, title, statutoryDeadline: deadline }, TODAY).severity === 'critical') {
      assert.match(deadline || '', /^(Comments close|Effective|Takes effect): /, title);
    }
  }
});

test('a consultation is closed only once its closing date has passed', () => {
  assert.equal(commentsClosed('Comments close: 2026-10-08', TODAY), false);
  assert.equal(commentsClosed('Comments close: 2026-10-07', TODAY), true);
  assert.equal(commentsClosed('Comments closed: 2026-05-22', TODAY), true);
  assert.equal(commentsClosed('No date published', TODAY), false);
  assert.equal(commentsClosed(undefined, TODAY), false);
});

test('comments closing today still count as open, and say so', () => {
  const r = assessImpact({ format: 'Consultations', type: 'CONSULTATION', title: 'Consultation on X', statutoryDeadline: 'Comments close: 2026-10-08' }, TODAY);
  assert.equal(r.score, 8.5);
  assert.match(r.reasons.join(' '), /comments close today/);
});

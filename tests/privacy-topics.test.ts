// Which items count as news on data privacy, in feeds that also cover other
// work (the FTC's, the OAIC's and China's policy library). The titles are from
// the feeds RegSonar reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mentionsPrivacy } from '../src/lib/privacyTopics.ts';

const PRIVACY = [
  'FTC Finalizes Changes to Children’s Privacy Rule',
  'FTC Takes Action Against Data Broker for Selling Sensitive Location Data',
  'Know your privacy obligations under the Anti-Money Laundering / Counter-Terrorism Financing reforms',
  'Data breach notifications increase to all-time high in 2025, new NDB stats show',
  'WASPI UK GDPR Code of Conduct for Information Sharing Protocols published',
  'California Expands Privacy Protections by Strengthening Deletion Rights',
  // Chinese and Japanese: personal information
  '个人信息出境认证办法',
  '令和８年度改正個人情報保護法について'
];
const NOT_PRIVACY = [
  'FTC, States Sue Lens.com for Misrepresenting the Price of Contact Lenses in Search Ads and on Its Website',
  'FOI guidance on the public interest test updated following Supreme Court ruling',
  'Principles for nationally consistent approaches to accessing Stolen Generations records',
  // A deferred prosecution agreement, not a data protection authority
  'Company enters DPA with prosecutors over bribery charges',
  // "Data" alone is not personal data
  'Monetary and Financial Developments in July 2026: Data Release'
];

for (const title of PRIVACY) {
  test(`privacy: ${title.slice(0, 60)}`, () => assert.ok(mentionsPrivacy(title)));
}
for (const title of NOT_PRIVACY) {
  test(`not privacy: ${title.slice(0, 60)}`, () => assert.ok(!mentionsPrivacy(title)));
}

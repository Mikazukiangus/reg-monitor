// Which items of general government news count as news on AI rules. The
// titles are from the feeds RegSonar reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAiRuleNews, mentionsAi } from '../shared/aiTopics.ts';

const RULE_NEWS = [
  'Governor Newsom signs new law to protect workers, require disclosures on AI-generated advertising',
  'Governor Newsom issues executive order to accelerate independent oversight and advance the creation of an AI kill switch',
  'Public and Private Sectors Work Together to Develop a National AI Safety Master Plan',
  'Commission publishes guidelines on transparency obligations for providers and deployers of certain AI systems',
  'Attorney General Phil Weiser letter to Congress RE: AI Moratorium Comment',
  'Copyright and Artificial Intelligence',
  'UK-Germany joint statement on advanced AI safety and security',
  // China's policy library
  '人工智能拟人化互动服务管理暂行办法',
  '关于印发《人工智能生成合成内容标识办法》的通知',
  '四部门关于印发国家人工智能产业综合标准化体系建设指南（2024版）的通知'
];
const NOT_RULE_NEWS: [string, string?][] = [
  // AI programmes and funding
  ['MSIT Steps Up AI Transformation of University Education with the Launch of 18 AI-centered Universities and 15 AX Graduate Schools'],
  ['Selected Consortiums Announced for AI for All Project'],
  // AI only in the summary
  ['Targeted energy bill support and simpler access to legal guidance among plans to put data to work to improve lives', 'Using AI to help people get support.'],
  // Safety that isn't AI safety; a signing that isn't a law
  ['January Safe2Tell data reflects emerging student safety challenges, including AI misuse'],
  ['New partnership set to see the UK and Ukraine develop battle winning technology as Britain secures access to Ukrainian AI', 'The agreement was signed in London.'],
  // Chinese plans to promote AI in an industry, and pilot zones
  ['工业和信息化部关于印发《“人工智能+软件”专项行动实施方案》的通知'],
  ['科技部关于印发《国家新一代人工智能创新发展试验区建设工作指引》的通知'],
  // Not about AI: "AI" only in capitals
  ['Thai authorities said retail sales rose'],
  ['FTC and USDA Seek Public Comment on Agricultural Equipment Manufacturing and Distribution Market Practices']
];

for (const title of RULE_NEWS) {
  test(`AI rule news: ${title.slice(0, 60)}`, () => assert.ok(isAiRuleNews(title)));
}
for (const [title, text] of NOT_RULE_NEWS) {
  test(`not AI rule news: ${title.slice(0, 60)}`, () => assert.ok(!isAiRuleNews(title, text)));
}

test('AI is recognised in Chinese and Japanese titles', () => {
  assert.ok(mentionsAi('人工智能拟人化互动服务管理暂行办法'));
  assert.ok(mentionsAi('互联网信息服务深度合成管理规定'));
  assert.ok(mentionsAi('令和9年度予算の概算要求におけるＡＩ関連予算を公表しました。'));
  assert.ok(!mentionsAi('数字乡村高质量发展行动计划（2026—2030年）'));
});

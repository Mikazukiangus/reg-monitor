// Each source's parser, run against responses recorded from the real feeds
// (tests/fixtures). A format change on a regulator's site shows up here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

process.env.VERCEL = '1';
delete process.env.DATABASE_URL;

const fixtures: Record<string, { file: string; contentType: string }> = JSON.parse(readFileSync('tests/fixtures/index.json', 'utf8'));

// The Federal Register, GOV.UK, MAS and SGX put the item limit in the URL; the recorded
// response holds more items than any test asks for, so the limit is ignored.
// BNM's page is per year, so any year gets the recorded one.
const withoutLimit = (url: string) =>
  url.replace(/([?&])(per_page|rows|count)=\d+/g, '$1$2=N').replace(/%22limit%22%3A\d+/g, '%22limit%22%3AN')
    .replace(/bnm\.gov\.my\/press-release-\d{4}/, 'bnm.gov.my/press-release-YEAR');
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

const { SOURCES } = await import('../server/sources/index.ts');
const { zonedToIso } = await import('../server/text.ts');
const { tagNotice } = await import('../server/notice.ts');
const { sgxPublicUrl } = await import('../server/sources/sgx.ts');
const { finraTitle } = await import('../server/sources/finra.ts');
const { parseMsitPressReleases } = await import('../server/sources/msit.ts');
const { severityOf } = await import('../src/lib/impact.ts');

const JURISDICTIONS = ['SG', 'HK', 'MY', 'AU', 'JP', 'KR', 'CN', 'UK_EU', 'US', 'GLOBAL'];
const FORMATS = ['Announcements', 'Circulars', 'Consultations', 'Enforcement', 'Guidelines', 'Technical Standards'];

for (const source of SOURCES) {
  if (source.name === 'UK FCA News RSS') {
    test('UK FCA: a blocked feed is reported as an error', async () => {
      await assert.rejects(source.fetch(), /HTTP 403/);
    });
    continue;
  }

  test(`${source.name}: notices are complete and well formed`, async () => {
    const notices = await source.fetch();
    // A feed narrowed to AI rules may have none in the recorded response
    if (!source.narrowed) assert.ok(notices.length > 0, 'no notices parsed');
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
      // Every source is scored by the same rubric, with its steps recorded
      assert.ok(n.tagging?.impact?.length, `no score reasons for ${n.id}`);
      assert.match(n.tagging!.impact!.at(-1)!, /: [+]?[\d.]+$/);
      assert.equal(n.severity, severityOf(n.impactScore));
    }
  });

  test(`${source.name}: the item limit is honoured`, async () => {
    requested.length = 0;
    const few = await source.fetch(1);
    // APIs that apply the limit themselves are asked for one item
    const askedForOne = requested.some(url => /[?&](per_page|rows)=1(&|$)|%22limit%22%3A1%2C/.test(url));
    assert.ok(few.length === 1 || askedForOne || (source.narrowed && few.length === 0), `${few.length} items`);
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

test('BNM press releases come from the year page, dated as Malaysian days', async () => {
  const notices = await byName('BNM Press Releases').fetch(30);
  const mps = notices.find(n => n.id === 'bnm-monetary-policy-statement-03092026');
  assert.equal(mps?.publishedAt, '2026-09-02T16:00:00.000Z');
  assert.equal(mps?.jurisdictionCode, 'MY');
  assert.deepEqual(mps?.sectors, ['Monetary & Financial Stability']);
  assert.ok(notices.every(n => n.dossierUrl?.startsWith('https://www.bnm.gov.my/')));
});

test('SC Malaysia court results are classed as enforcement', async () => {
  const notices = await byName('SC Malaysia Media Releases').fetch(30);
  const suit = notices.find(n => /^SC Wins Suit Against/.test(n.title));
  assert.equal(suit?.format, 'Enforcement');
  assert.equal(suit?.publishedAt, '2026-08-19T16:00:00.000Z');
  assert.ok(suit?.summary, 'summary from the page');
  assert.equal(notices.find(n => /^SC Charges Brothers/.test(n.title))?.format, 'Enforcement');
});

test('a stored notice is re-classified and re-scored when read back', () => {
  // Stored under older rules as enforcement, scored 8.5
  const stored = {
    id: 'hkma-20260930-3', ref: 'HKMA Press Release', title: 'Hong Kong Monetary Authority and Bank Indonesia Strengthen Cooperation in Cross-Border Payments',
    regulator: 'HKMA', jurisdiction: 'HONG KONG', jurisdictionCode: 'HK' as const, type: 'PRESS RELEASE',
    typeColorClass: { bg: '', text: '' }, impactScore: 8.5, issuedTimeAgo: '', tags: ['HKMA', 'Enforcement'],
    sector: 'General & Institutional' as const, format: 'Enforcement' as const, severity: 'critical' as const, isLiveFeed: false
  };
  const n = tagNotice(stored);
  assert.equal(n.format, 'Announcements');
  assert.equal(n.impactScore, 3);
  assert.equal(n.severity, 'info');
  assert.ok(!n.tags.includes('Enforcement') && n.tags.includes('Announcements'));
});

test('a stored notice tagged when data privacy was in the AI sector\'s name gets its own sector', () => {
  const stored = {
    id: 'ico-old', ref: 'ICO News', title: 'ICO fines retailer over data breach', regulator: 'ICO', jurisdiction: 'UNITED KINGDOM',
    jurisdictionCode: 'UK_EU' as const, type: 'MONETARY PENALTIES', typeColorClass: { bg: '', text: '' }, impactScore: 5,
    issuedTimeAgo: '', tags: ['ICO', 'Data privacy', 'Enforcement', 'AI, Data Privacy, Cyber & Tech Risk'],
    sector: 'General & Institutional' as const, format: 'Enforcement' as const, severity: 'high' as const, isLiveFeed: false
  };
  const n = tagNotice(stored);
  assert.equal(n.sector, 'Data Privacy & Protection');
  assert.ok(!n.tags.includes('AI, Data Privacy, Cyber & Tech Risk') && !n.tags.includes('AI, Cyber & Tech Risk'));
  assert.equal(n.tags.filter(t => t === 'Data Privacy & Protection').length, 1);
  assert.ok(n.tags.includes('Data privacy'));
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
  assert.equal(enforcementRules?.format, 'Announcements');
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

test('AI rules: each source is tagged and placed in its jurisdiction', async () => {
  const expected: Record<string, string> = {
    'European Commission AI News': 'UK_EU', 'UK DSIT & AI Security Institute': 'UK_EU', 'US Federal Register: AI': 'US',
    'California Governor on AI': 'US', 'Colorado AG on AI': 'US', 'Korea MSIT on AI': 'KR', 'China State Council Policy Library: AI': 'CN',
    'Japan Cabinet Office AI Strategy': 'JP'
  };
  for (const [name, code] of Object.entries(expected)) {
    const notices = await byName(name).fetch(20);
    assert.ok(notices.length > 0, name);
    assert.ok(notices.every(n => n.jurisdictionCode === code && n.tags.includes('AI rules')), name);
  }
});

test('European Commission AI news keeps items on AI rules, dated as Brussels days', async () => {
  const notices = await byName('European Commission AI News').fetch(20);
  const enforcing = notices.find(n => /^Commission starts enforcing AI Act rules/.test(n.title));
  assert.equal(enforcing?.publishedAt, '2026-07-30T22:00:00.000Z');
  assert.equal(enforcing?.dossierUrl, 'https://digital-strategy.ec.europa.eu/en/news/commission-starts-enforcing-ai-act-rules-and-new-transparency-requirements-2-august');
  assert.ok(notices.every(n => n.regulator === 'European Commission' && n.sectors?.includes('AI, Cyber & Tech Risk')));
  // On the AI topic but not about AI rules
  assert.ok(!notices.some(n => /Startup Award|EDIC for Agri-Food/.test(n.title)));
});

test('Federal Register AI documents are those whose title is about AI, less meeting notices', async () => {
  const notices = await byName('US Federal Register: AI').fetch(20);
  assert.deepEqual(notices.map(n => n.title), [
    'Inaugurating the Era of Super Intelligence',
    'Request for Information (RFI) on Modernizing the National Vulnerability Database in the Age of AI'
  ].map(t => notices.find(n => n.title.startsWith(t.slice(0, 60)))?.title));
  assert.equal(notices[0].regulator, 'US President');
  assert.equal(notices[1].regulator, 'NIST');
  assert.equal(notices[1].statutoryDeadline, 'Comments close: 2026-10-13');
});

test('Korea MSIT press releases: titles and dates from the list script, linked to the release', async () => {
  const html = readFileSync(`tests/fixtures/${fixtures['https://www.msit.go.kr/eng/bbs/list.do?sCode=eng&mId=4&mPid=2'].file}`, 'utf8');
  const rows = parseMsitPressReleases(html);
  assert.ok(rows.length >= 10);
  assert.deepEqual(rows.find(r => r.id === '1311'), { id: '1311', title: 'Public and Private Sectors Work Together to Develop a National AI Safety Master Plan', date: '2026-10-08' });
  const notices = await byName('Korea MSIT on AI').fetch(20);
  // AI programmes and funding are left out; only the safety plan is about AI rules
  assert.deepEqual(notices.map(n => n.id), ['msit-1311']);
  assert.equal(notices[0].dossierUrl, 'https://www.msit.go.kr/eng/bbs/view.do?sCode=eng&mId=4&mPid=2&bbsSeqNo=42&nttSeqNo=1311');
});

test('China policy library: AI rules in Chinese, gazette orders as department rules, plans left out', async () => {
  const notices = await byName('China State Council Policy Library: AI').fetch(20);
  // The order's issuers are taken off the title; the CAC issued it with four others
  const humanlike = notices.find(n => n.title === '人工智能拟人化互动服务管理暂行办法');
  assert.equal(humanlike?.type, 'DEPARTMENT RULES');
  assert.equal(humanlike?.regulator, 'CAC');
  assert.equal(humanlike?.ref, 'CAC Order No. 21');
  assert.equal(humanlike?.impactScore, 7.5);
  assert.equal(humanlike?.publishedAt, '2026-06-20T03:00:00.000Z');
  assert.equal(humanlike?.dossierUrl, 'https://www.gov.cn/gongbao/2026/issue_12806/202606/content_7072472.html');
  // Measures issued by a department's notice count as rules made too
  const labelling = notices.find(n => n.title === '关于印发《人工智能生成合成内容标识办法》的通知');
  assert.equal(labelling?.regulator, 'CAC');
  assert.equal(labelling?.impactScore, 7.5);
  assert.ok(notices.every(n => n.language === 'zh' && n.sectors?.includes('AI, Cyber & Tech Risk')));
  // Plans to promote AI in an industry, pilot zones and speeches are left out
  assert.ok(!notices.some(n => /人工智能\+软件|试验区|讲话/.test(n.title)), notices.map(n => n.title).join(' | '));
  // The Gazette's reprint of a document already listed is dropped
  assert.equal(notices.filter(n => n.title.includes('生成式人工智能服务管理暂行办法')).length, 1);
});

test('Japan Cabinet Office AI topics: meetings are routine, calls for comments are consultations', async () => {
  const notices = await byName('Japan Cabinet Office AI Strategy').fetch(30);
  assert.ok(notices.every(n => n.language === 'ja' && n.jurisdictionCode === 'JP'));
  assert.equal(notices.find(n => n.title === '第５回人工知能戦略本部を開催しました。')?.impactScore, 3);
  assert.equal(notices.find(n => n.title.startsWith('人工知能基本計画（素案）に関する御意見の募集'))?.format, 'Consultations');
});

test('UK AI policy: items whose title is about AI, from DSIT or the AI Security Institute', async () => {
  const notices = await byName('UK DSIT & AI Security Institute').fetch(20);
  assert.ok(notices.every(n => ['UK DSIT', 'UK AI Security Institute'].includes(n.regulator)));
  assert.ok(notices.every(n => /\bAI\b|Artificial Intelligence/i.test(n.title)), 'AI in every title');
});

test('Data privacy: each source is tagged, in the data privacy sector and placed in its jurisdiction', async () => {
  const expected: Record<string, string> = {
    'UK ICO News': 'UK_EU', 'EDPB News': 'UK_EU', 'Singapore PDPC News': 'SG', 'Malaysia JPDP Announcements': 'MY',
    'Australia OAIC on Privacy': 'AU', 'Japan PPC News': 'JP', 'Korea PIPC Notices': 'KR',
    'China State Council Policy Library: Personal Information': 'CN', 'CalPrivacy News': 'US'
  };
  for (const [name, code] of Object.entries(expected)) {
    const notices = await byName(name).fetch(20);
    assert.ok(notices.length > 0, name);
    assert.ok(notices.every(n => n.jurisdictionCode === code && n.tags.includes('Data privacy') && n.sectors?.includes('Data Privacy & Protection')), name);
  }
});

test('ICO news: from its search service, less speeches and freedom of information, dated as London days', async () => {
  requested.length = 0;
  const notices = await byName('UK ICO News').fetch(20);
  assert.deepEqual(requested, ['https://ico.org.uk/api/search']);
  const met = notices.find(n => n.title.startsWith('ICO takes action against Metropolitan Police Service'));
  assert.equal(met?.format, 'Enforcement');
  assert.equal(met?.publishedAt, '2026-10-13T23:00:00.000Z');
  assert.equal(met?.dossierUrl, 'https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2026/10/ico-takes-action-against-metropolitan-police-service-over-information-governance-failures/');
  assert.ok(!notices.some(n => /opening speech|^FOI guidance/.test(n.title)), notices.map(n => n.title).join(' | '));
});

test('EDPB news: national authorities\' fines are enforcement; an automated decision-making fine is also about AI rules', async () => {
  const notices = await byName('EDPB News').fetch(20);
  assert.ok(notices.every(n => n.regulator === 'EDPB'));
  const uber = notices.find(n => n.title.startsWith('Dutch DPA fines Uber'));
  assert.equal(uber?.format, 'Enforcement');
  assert.ok(uber?.tags.includes('AI rules'));
  assert.match(String(uber?.summary), /^\S/);
});

test('PDPC news: speeches and events left out, decisions and undertakings are enforcement', async () => {
  const notices = await byName('Singapore PDPC News').fetch(20);
  assert.ok(!notices.some(n => /^(Keynote|Opening|Closing)|Singapore Data Festival 2026$|Privacy Awareness Week/.test(n.title)), notices.map(n => n.title).join(' | '));
  assert.equal(notices.find(n => n.title === 'New Undertakings on 9 April 2026')?.format, 'Enforcement');
  const genAi = notices.find(n => n.title.startsWith('PDPC Issues Guidance for Organisations on Responsible'));
  assert.equal(genAi?.format, 'Guidelines');
  assert.ok(genAi?.tags.includes('AI rules'));
  assert.match(String(genAi?.dossierUrl), /^https:\/\/www\.pdpc\.gov\.sg\/media-events\//);
});

test('JPDP announcements: procurement notices left out; the AI and personal data paper is a consultation', async () => {
  const notices = await byName('Malaysia JPDP Announcements').fetch(20);
  assert.ok(!notices.some(n => /PEROLEHAN/.test(n.title)));
  const paper = notices.find(n => n.title.startsWith('PUBLIC CONSULTATION PAPER NO. 1/2026'));
  assert.equal(paper?.format, 'Consultations');
  assert.ok(paper?.tags.includes('AI rules'));
});

test('OAIC: privacy items only, linked to the page behind the search redirect', async () => {
  const notices = await byName('Australia OAIC on Privacy').fetch(20);
  assert.ok(!notices.some(n => /Stolen Generations|information integrity/i.test(n.title)), notices.map(n => n.title).join(' | '));
  assert.equal(notices.find(n => n.title.startsWith('OAIC opens investigation into maker of HeyCyan'))?.dossierUrl,
    'https://www.oaic.gov.au/news/media-centre/oaic-opens-investigation-into-maker-of-heycyan-smart-glasses-phone-app');
});

test('PPC news: in Japanese, less commission meetings and opt-out filing lists', async () => {
  const notices = await byName('Japan PPC News').fetch(30);
  assert.ok(notices.every(n => n.language === 'ja'));
  assert.ok(!notices.some(n => /個人情報保護委員会を開催しました|オプトアウト届出書/.test(n.title)), notices.map(n => n.title).join(' | '));
  assert.ok(notices.every(n => !/[?&]ref=/.test(String(n.dossierUrl))));
});

test('PIPC notices: sanctions are enforcement, linked to the release', async () => {
  const notices = await byName('Korea PIPC Notices').fetch(20);
  const kt = notices.find(n => n.title === 'The PIPC Sanctions KT Corporation for Data Breaches');
  assert.equal(kt?.format, 'Enforcement');
  assert.equal(kt?.dossierUrl, 'https://pipc.go.kr/eng/user/ltn/new/noticeDetail.do?bbsId=BBSMSTR_000000000001&nttId=3133');
});

test('China policy library: personal information rules in Chinese, titles that only match the search left out', async () => {
  const notices = await byName('China State Council Policy Library: Personal Information').fetch(20);
  assert.ok(notices.every(n => n.title.includes('个人信息') && n.language === 'zh'), notices.map(n => n.title).join(' | '));
  const simplified = notices.find(n => n.title === '小型个人信息处理者个人信息保护简化措施规定');
  assert.equal(simplified?.ref, 'CAC Order No. 25');
  assert.equal(simplified?.type, 'DEPARTMENT RULES');
});

test('CalPrivacy: every item is kept, as data privacy', async () => {
  const notices = await byName('CalPrivacy News').fetch(20);
  assert.equal(notices.length, 10);
});

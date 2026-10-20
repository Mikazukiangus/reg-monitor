import { isAiRuleNews } from '../../shared/aiTopics.js';
import { fetchOrThrow } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { lastPathPart } from '../text.js';
import { aiNotice, privacyNotice, type TopicItem } from './topics.js';

// China's AI rules are made by the Cyberspace Administration (CAC) and other
// State Council departments. The CAC's own site doesn't accept connections
// from the hosting region, so they come from the State Council's policy
// library on gov.cn, through the search service its page uses: State Council
// documents, departments' documents, and the State Council Gazette, which
// prints department rules (orders) some weeks after they are issued. Titles
// stay in Chinese.
// Searched for 人工智能 (artificial intelligence) or 个人信息 (personal information)
export const GOV_CN_POLICY_SEARCH = (q: string, n: number) => `https://sousuo.www.gov.cn/search-gov/data?${new URLSearchParams({
  t: 'zhengcelibrary', q, searchfield: 'title', sort: 'pubtime', sortType: '1', type: 'gwyzcwjk', p: '1', n: String(n)
})}`;
export const GOV_CN_AI = '人工智能';
export const GOV_CN_PRIVACY = '个人信息';
// The library's other list (news and explainers) is left out
const GOV_CN_LISTS: Record<string, string> = {
  gongwen: 'STATE COUNCIL DOCUMENT',
  bumenfile: 'DEPARTMENT DOCUMENT',
  gongbao: 'STATE COUNCIL GAZETTE'
};
// Lead issuers, by the names the library uses
const GOV_CN_ISSUERS: [RegExp, string][] = [
  [/网信|互联网信息办公室/, 'CAC'],
  [/工业和信息化部/, 'MIIT'],
  [/发展和?改革委/, 'NDRC'],
  [/^科学?技术?部$/, 'MOST'],
  [/^教育部$/, 'MOE'],
  [/^公安部$/, 'MPS'],
  [/市场监(督)?管(理)?总局/, 'SAMR'],
  [/^国家数据局$/, 'NDA'],
  [/卫生健康委/, 'NHC'],
  [/药监局|药品监督管理局/, 'NMPA'],
  [/知识产权局/, 'CNIPA'],
  [/气象局/, 'CMA'],
  [/广电总局|广播电视总局/, 'NRTA'],
  [/标准化管理委员会|标准委/, 'SAC'],
  [/人力资源社会保障部/, 'MOHRSS'],
  [/^商务部$/, 'MOFCOM'],
  [/民航局|民用航空局/, 'CAAC'],
  [/^民政部$/, 'MCA'],
  [/^中国人民银行$|^人民银行$/, 'PBOC'],
  [/金融监督管理总局|金融监管总局/, 'NFRA'],
  [/邮政局/, 'SPB'],
  [/^国务院$/, 'State Council']
];
// "...总局令（第21号）\n人工智能拟人化互动服务管理暂行办法": an order and the rules it makes
const GOV_CN_ORDER = /^(.+?)令（第(\d+)号）\n(.+)$/;
const GOV_CN_SPEECH = /讲话|致辞|致信|贺信/;

// Search hits mark the query in <em>. Gazette titles wrap with <br/> and one
// ideographic space, and start a new line (the rules an order makes, or the
// plan a notice issues) with two.
const govCnTitle = (title: string) => title
  .replace(/<br\s*\/?>　　/g, '\n')
  .replace(/<br\s*\/?>[ 　]*/g, '')
  .replace(/<[^>]*>?/g, '')
  .replace(/…{2,}[\s\S]*$/, '')
  .trim();

function govCnIssuer(issuers: string): string {
  const lead = issuers.split(/[\s 　]+/)[0].replace(/^中华人民共和国/, '').replace(/等$/, '').replace(/办公厅$/, '');
  return GOV_CN_ISSUERS.find(([pattern]) => pattern.test(lead))?.[1] ?? lead;
}

export function parseGovCnPolicies(json: any): { id: string; title: string; url: string; published: string; type: string; regulator: string; order?: string }[] {
  const catMap = json?.searchVO?.catMap ?? {};
  const rows = Object.entries(GOV_CN_LISTS).flatMap(([list, type]) =>
    ((catMap[list]?.listVO ?? []) as any[]).flatMap(item => {
      const lines = govCnTitle(String(item.title ?? ''));
      const order = lines.match(GOV_CN_ORDER);
      const title = order ? order[3] : lines.split('\n')[0];
      const url = String(item.url ?? '');
      if (!title || !url || !Number.isFinite(item.pubtime) || GOV_CN_SPEECH.test(title)) return [];
      // Issuers: the order's, the list's, or those before "关于" (concerning) in the title
      const issuers = order ? order[1] : String(item.puborg || (list === 'gongwen' ? '国务院' : title.split('关于')[0]));
      return [{
        id: `govcn-${lastPathPart(url)}`,
        title,
        url,
        published: new Date(item.pubtime).toISOString(),
        type: order ? 'DEPARTMENT RULES' : type,
        regulator: govCnIssuer(issuers) || 'State Council Gazette',
        order: order?.[2]
      }];
    })
  );
  // The Gazette reprints documents from the other lists, sometimes with the
  // issuers before the title: keep the first publication
  const key = (title: string) => title.replace(/\s/g, '');
  const kept: typeof rows = [];
  for (const row of rows.sort((a, b) => a.published.localeCompare(b.published))) {
    if (!kept.some(k => key(row.title).endsWith(key(k.title)) || key(k.title).endsWith(key(row.title)))) kept.push(row);
  }
  return kept.reverse();
}

export async function fetchGovCnAiPolicies(limit = 4): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(GOV_CN_POLICY_SEARCH(GOV_CN_AI, 50));
  return parseGovCnPolicies(await res.json())
    .filter(r => isAiRuleNews(r.title))
    .slice(0, limit)
    .map(r => aiNotice(govCnItem(r)));
}

// China's rules on personal information (the Personal Information Protection
// Law's measures, such as those on cross-border transfers and compliance
// audits), from the same library. The search also finds titles that don't
// contain the phrase, so the title must.
export async function fetchGovCnPrivacyPolicies(limit = 4): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(GOV_CN_POLICY_SEARCH(GOV_CN_PRIVACY, 50));
  return parseGovCnPolicies(await res.json())
    .filter(r => r.title.includes(GOV_CN_PRIVACY))
    .slice(0, limit)
    .map(r => privacyNotice(govCnItem(r)));
}

function govCnItem(r: ReturnType<typeof parseGovCnPolicies>[number]): TopicItem {
  return {
    id: r.id,
    ref: r.order ? `${r.regulator} Order No. ${r.order}` : `${r.regulator} ${r.published.slice(0, 10)}`,
    title: r.title,
    regulator: r.regulator,
    jurisdiction: 'CHINA',
    jurisdictionCode: 'CN',
    type: r.type,
    publishedAt: r.published,
    url: r.url,
    language: 'zh'
  };
}

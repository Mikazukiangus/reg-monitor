import { isAiRuleNews } from '../../shared/aiTopics.js';
import { pagesFor, readPages } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { isoDay, plainText, newestFirst, uniqueBy, zonedToIso } from '../text.js';
import { aiNotice } from './topics.js';

// South Korea's Ministry of Science and ICT administers the Framework Act on
// AI: its English press releases. The list page writes each row's title and
// date in a script, and a row opens view.do with the row's number.
export const MSIT_LIST = 'https://www.msit.go.kr/eng/bbs/list.do?sCode=eng&mId=4&mPid=2';
const msitPage = (n: string) => `https://www.msit.go.kr/eng/bbs/view.do?sCode=eng&mId=4&mPid=2&bbsSeqNo=42&nttSeqNo=${n}`;

export function parseMsitPressReleases(html: string): { id: string; title: string; date: string }[] {
  const ids = [...html.matchAll(/onclick="fn_detail\((\d+)\);"/g)].map(m => m[1]);
  return ids.flatMap((id, i) => {
    const row = `'NO'+'_${i}')`;
    const start = html.indexOf(row);
    const end = html.indexOf(`'NO'+'_${i + 1}')`, start);
    if (start < 0) return [];
    const script = html.slice(start, end < 0 ? undefined : end);
    const title = script.match(/unescape\('([^']*)'\)/)?.[1];
    const day = script.match(/'REG_DT'\)\{\s*\$\('#td_'\+'NO'\+'_\d+'\)\.html\('([^']+)'\)/)?.[1];
    const date = day && isoDay(day);
    return title && date ? [{ id, title: plainText(title), date }] : [];
  });
}

export async function fetchMsitPressReleases(limit = 4): Promise<NormalizedNotice[]> {
  const pages = Array.from({ length: pagesFor(limit, 10, 3) }, (_, i) => (i ? `${MSIT_LIST}&pageIndex=${i + 1}` : MSIT_LIST));
  const rows = await readPages(pages, parseMsitPressReleases);
  return newestFirst(uniqueBy(rows, r => r.id))
    .filter(r => isAiRuleNews(r.title))
    .slice(0, limit)
    .map(r => aiNotice({
      id: `msit-${r.id}`,
      ref: `MSIT Press Release ${r.date}`,
      title: r.title,
      regulator: 'MSIT',
      jurisdiction: 'SOUTH KOREA',
      jurisdictionCode: 'KR',
      type: 'PRESS RELEASE',
      publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Asia/Seoul'),
      url: msitPage(r.id)
    }));
}

import { pagesFor, readPages } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { plainText, newestFirst, uniqueBy, zonedToIso } from '../text.js';
import { privacyNotice } from './topics.js';

// South Korea's Personal Information Protection Commission: its English
// notices and press releases (HTML table; a row opens the release by number)
export const PIPC_LIST = 'https://pipc.go.kr/eng/user/ltn/new/noticeList.do';
const pipcPage = (n: string) => `https://pipc.go.kr/eng/user/ltn/new/noticeDetail.do?bbsId=BBSMSTR_000000000001&nttId=${n}`;

export function parsePipcNotices(html: string): { id: string; title: string; date: string }[] {
  return html.split('<td class="tb_title">').slice(1).flatMap(chunk => {
    const link = chunk.match(/noticeDetail\('(\d+)'\)">([\s\S]*?)<\/a>/);
    const day = chunk.match(/class="tb_date">\s*(\d{4})\.(\d{2})\.(\d{2})/);
    if (!link || !day) return [];
    return [{ id: link[1], title: plainText(link[2]), date: `${day[1]}-${day[2]}-${day[3]}` }];
  });
}

export async function fetchPipcNotices(limit = 4): Promise<NormalizedNotice[]> {
  const pages = Array.from({ length: pagesFor(limit, 10, 3) }, (_, i) => (i ? `${PIPC_LIST}?pageIndex=${i + 1}` : PIPC_LIST));
  const rows = await readPages(pages, parsePipcNotices);
  return newestFirst(uniqueBy(rows, r => r.id)).slice(0, limit).map(r => privacyNotice({
    id: `pipc-${r.id}`,
    ref: `PIPC ${r.date}`,
    title: r.title,
    regulator: 'PIPC',
    jurisdiction: 'SOUTH KOREA',
    jurisdictionCode: 'KR',
    type: 'PRESS RELEASE',
    publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Asia/Seoul'),
    url: pipcPage(r.id)
  }));
}

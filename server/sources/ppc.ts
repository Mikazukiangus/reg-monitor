import { fetchOrThrow } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { plainText, newestFirst, zonedToIso, shortHash } from '../text.js';
import { privacyNotice } from './topics.js';

// Japan's Personal Information Protection Commission: its news list (HTML, in
// Japanese; the English site has a few items a year). Kept: the Act on the
// Protection of Personal Information and the My Number Act, press releases,
// calls for comments, international cooperation and activity reports. Left
// out: commission meetings, recruitment, budgets and procurement, and the
// routine notices of opt-out filings received and of the chair's travel.
const PPC_SITE = 'https://www.ppc.go.jp';
export const PPC_NEWS = `${PPC_SITE}/information/`;
const PPC_KINDS: Record<string, string> = {
  個人情報保護法等: 'PERSONAL INFORMATION PROTECTION ACT',
  報道発表: 'PRESS RELEASE',
  意見募集: 'PUBLIC CONSULTATION',
  マイナンバー: 'MY NUMBER ACT',
  国際関係: 'INTERNATIONAL',
  活動報告等: 'ACTIVITY REPORT'
};
const PPC_ROUTINE = /オプトアウト届出書|国際活動（出張等）/;

export function parsePpcNews(html: string): { date: string; kind: string; url: string; title: string }[] {
  return html.split(/<li>\s*<time /).slice(1).flatMap(chunk => {
    const date = chunk.match(/^datetime="(\d{4}-\d{2}-\d{2})"/)?.[1];
    const label = chunk.match(/class="news-label [^"]*">([^<]+)</)?.[1]?.trim();
    const link = chunk.match(/<div class="news-text">\s*<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const kind = label && PPC_KINDS[label];
    if (!date || !kind || !link || PPC_ROUTINE.test(link[2])) return [];
    const url = new URL(link[1].replace(/&amp;/g, '&'), PPC_SITE);
    url.searchParams.delete('ref');
    return [{ date, kind, url: url.toString(), title: plainText(link[2]) }];
  });
}

export async function fetchPpcNews(limit = 4): Promise<NormalizedNotice[]> {
  const rows = parsePpcNews(await (await fetchOrThrow(PPC_NEWS)).text());
  return newestFirst(rows).slice(0, limit).map(r => privacyNotice({
    // A page can be listed more than once as it is updated, so the title is part of the id
    id: `ppc-${r.date}-${shortHash(r.title)}`,
    ref: `PPC ${r.date}`,
    title: r.title,
    regulator: 'PPC',
    jurisdiction: 'JAPAN',
    jurisdictionCode: 'JP',
    type: r.kind,
    publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Asia/Tokyo'),
    url: r.url,
    language: 'ja'
  }));
}

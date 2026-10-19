import { createHash } from 'crypto';
import { fetchOrThrow } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { plainText, newestFirst, zonedToIso } from '../text.js';
import { aiNotice } from './topics.js';

// Japan's AI policy under the AI Promotion Act: the topics list of the Cabinet
// Office's AI strategy pages (the secretariat of the AI Strategy Headquarters),
// in Japanese. Every topic is about AI.
export const CAO_AI_TOPICS = 'https://www8.cao.go.jp/cstp/ai/ai_topics/ai_topics.html';

export function parseCaoAiTopics(html: string, pageUrl: string): { date: string; url: string; title: string }[] {
  return [...html.matchAll(/<dt>(\d{4})年(\d{1,2})月(\d{1,2})日<\/dt>\s*<dd><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({
    date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
    url: new URL(m[4], pageUrl).toString(),
    title: plainText(m[5])
  }));
}

export async function fetchCaoAiTopics(limit = 4): Promise<NormalizedNotice[]> {
  const rows = parseCaoAiTopics(await (await fetchOrThrow(CAO_AI_TOPICS)).text(), CAO_AI_TOPICS);
  return newestFirst(rows).slice(0, limit).map(r => aiNotice({
    id: `cao-ai-${r.date}-${createHash('sha1').update(r.title).digest('hex').slice(0, 8)}`,
    ref: `Cabinet Office AI Strategy ${r.date}`,
    title: r.title,
    regulator: 'Cabinet Office',
    jurisdiction: 'JAPAN',
    jurisdictionCode: 'JP',
    type: 'AI STRATEGY',
    publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Asia/Tokyo'),
    url: r.url,
    language: 'ja'
  }));
}

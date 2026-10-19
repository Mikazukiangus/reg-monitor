import { rssItems } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { toIso, lastPathPart, plainText } from '../text.js';
import { privacyNotice } from './topics.js';

// The European Data Protection Board: its guidelines, opinions and statements,
// and national authorities' decisions that it reports (RSS)
export const EDPB_RSS = 'https://www.edpb.europa.eu/feed/news_en';

export async function fetchEdpbNews(limit = 4): Promise<NormalizedNotice[]> {
  const items = await rssItems(EDPB_RSS);
  return items.slice(0, limit).map((item: any) => {
    const link = String(item.link);
    const published = toIso(item.pubDate);
    // The item's first paragraph
    const lead = String(item.description ?? '').match(/<p>([\s\S]*?)<\/p>/)?.[1];
    return privacyNotice({
      id: `edpb-${lastPathPart(link)}`.slice(0, 120),
      ref: `EDPB News ${published?.slice(0, 10) ?? ''}`.trim(),
      title: plainText(String(item.title)),
      regulator: 'EDPB',
      jurisdiction: 'EUROPEAN UNION',
      jurisdictionCode: 'UK_EU',
      type: 'NEWS',
      publishedAt: published,
      summary: lead ? plainText(lead) || undefined : undefined,
      url: link
    });
  });
}

import { rssItems } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { plainText, toIso, lastPathPart } from '../text.js';
import { privacyNotice } from './topics.js';

// Malaysia's Personal Data Protection Department (JPDP): announcements from
// its English site's WordPress feed, less procurement notices
export const JPDP_RSS = 'https://www.pdp.gov.my/ppdpv1/en/feed/';
const PROCUREMENT = /\b(?:perolehan|sebut ?harga|tender|procurement)\b/i;

export async function fetchJpdpNews(limit = 4): Promise<NormalizedNotice[]> {
  const items = await rssItems(JPDP_RSS);
  return items
    .map((item: any) => ({ title: plainText(String(item.title)), link: String(item.link), published: toIso(item.pubDate) }))
    .filter(x => !PROCUREMENT.test(x.title))
    .slice(0, limit)
    .map(x => privacyNotice({
      id: `jpdp-${lastPathPart(x.link)}`.slice(0, 120),
      ref: `JPDP ${x.published?.slice(0, 10) ?? ''}`.trim(),
      title: x.title,
      regulator: 'JPDP',
      jurisdiction: 'MALAYSIA',
      jurisdictionCode: 'MY',
      type: 'ANNOUNCEMENT',
      publishedAt: x.published,
      url: x.link
    }));
}

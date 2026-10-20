import { isAiRuleNews, mentionsAi } from '../../shared/aiTopics.js';
import { mentionsPrivacy } from '../../shared/privacyTopics.js';
import { rssItems } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { plainText, toIso, lastPathPart } from '../text.js';
import { topicNotice } from './topics.js';

// RSS feeds of US agencies and states with AI rules. Their feeds cover all
// their work, so only items about AI rules are kept (a regulator whose every
// item is a rule matter needs only an AI mention). privacy: 'mentions' also
// keeps items whose title concerns privacy; 'all' keeps every item, from a
// privacy regulator.
interface AiFeed {
  id: string;
  url: string;
  regulator: string;
  jurisdiction: string;
  type: string;
  aiMentionOnly?: true;
  privacy?: 'mentions' | 'all';
}

// The FTC: inquiries, enforcement and policy statements on AI, and its
// enforcement of privacy and data security
export const FTC: AiFeed = { id: 'ftc', url: 'https://www.ftc.gov/feeds/press-release.xml', regulator: 'US FTC', jurisdiction: 'UNITED STATES', type: 'PRESS RELEASE', privacy: 'mentions' };
// California's governor signs the state's AI laws (such as SB 53 on frontier
// AI); the office's site search for "artificial intelligence", as a feed
export const CALIFORNIA_GOVERNOR_AI: AiFeed = { id: 'ca-gov', url: 'https://www.gov.ca.gov/?s=artificial+intelligence&feed=rss2', regulator: 'California Governor', jurisdiction: 'UNITED STATES (CALIFORNIA)', type: 'NEWS' };
// California's privacy regulator (CalPrivacy, the CPPA), which enforces the
// state's privacy law and makes its rules, including those on automated
// decisionmaking technology (ADMT). Every item is kept.
export const CALPRIVACY: AiFeed = { id: 'calprivacy', url: 'https://privacy.ca.gov/feed/', regulator: 'CalPrivacy (CPPA)', jurisdiction: 'UNITED STATES (CALIFORNIA)', type: 'NEWS', aiMentionOnly: true, privacy: 'all' };
// Colorado's attorney general enforces, and makes rules under, the Colorado AI Act
export const COLORADO_AG_AI: AiFeed = { id: 'co-ag', url: 'https://coag.gov/?s=artificial+intelligence&feed=rss2', regulator: 'Colorado AG', jurisdiction: 'UNITED STATES (COLORADO)', type: 'NEWS' };

// A description that is only a link to the item (the California Governor's
// feed gives just "Source"), which says nothing about it
export const LINK_ONLY = /^(?:source|read more|continue reading|more|link)\W*$/i;

export async function fetchAiFeed(feed: AiFeed, limit: number): Promise<NormalizedNotice[]> {
  const items = await rssItems(feed.url);
  return items
    .map((item: any) => ({
      title: plainText(String(item.title)),
      description: item.description ? plainText(String(item.description)).replace(/\s*View Press Release$/, '').replace(/\s*The post .* appeared first on .*$/, '').replace(LINK_ONLY, '') : '',
      link: String(item.link),
      published: toIso(item.pubDate)
    }))
    .map(x => ({
      ...x,
      ai: feed.aiMentionOnly ? mentionsAi(`${x.title} ${x.description}`) : isAiRuleNews(x.title, x.description),
      privacy: feed.privacy === 'all' || mentionsPrivacy(x.title)
    }))
    // An item on AI rules whose title is about personal data gets both tags
    .filter(x => x.ai || (x.privacy && feed.privacy))
    .slice(0, limit)
    .map(x => topicNotice({
      id: `${feed.id}-${lastPathPart(x.link)}`.slice(0, 120),
      ref: `${feed.regulator} ${x.published?.slice(0, 10) ?? ''}`.trim(),
      title: x.title,
      regulator: feed.regulator,
      jurisdiction: feed.jurisdiction,
      jurisdictionCode: 'US',
      type: feed.type,
      publishedAt: x.published,
      summary: x.description || undefined,
      url: x.link
    }, [...(x.privacy ? ['Data privacy'] : []), ...(x.ai ? ['AI rules'] : [])]));
}

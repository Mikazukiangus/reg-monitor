import { isAiRuleNews, mentionsAi } from '../../shared/aiTopics.js';
import { mentionsPrivacy } from '../../shared/privacyTopics.js';
import { fetchOrThrow, rssItems } from '../http.js';
import { config } from '../../runtime-config.js';
import type { NormalizedNotice } from '../notice.js';
import { plainText, toIso, lastPathPart } from '../text.js';
import { aiNotice, topicNotice } from './topics.js';

// RSS feeds of US agencies and states with AI rules. Their feeds cover all
// their work, so only items about AI rules are kept (a regulator whose every
// item is a rule matter needs only an AI mention). privacy: 'mentions' also
// keeps items whose title concerns privacy; 'all' keeps every item, from a
// privacy regulator. relayUrl, when set, is where the feed is read from
// instead (server/relay.ts); url stays the feed's own address.
interface AiFeed {
  id: string;
  url: string;
  relayUrl?: string;
  regulator: string;
  jurisdiction: string;
  type: string;
  aiMentionOnly?: true;
  privacy?: 'mentions' | 'all';
}

// The FTC: inquiries, enforcement and policy statements on AI, and its
// enforcement of privacy and data security. ftc.gov refuses requests from
// outside the US, so on Vercel the feed is read through api/ftc-feed.ts.
export const FTC: AiFeed = { id: 'ftc', url: 'https://www.ftc.gov/feeds/press-release.xml', relayUrl: config.relay.ftcFeedUrl, regulator: 'US FTC', jurisdiction: 'UNITED STATES', type: 'PRESS RELEASE', privacy: 'mentions' };
// California's governor signs the state's AI laws (such as SB 53 on frontier
// AI); the office's site search for "artificial intelligence", as a feed
export const CALIFORNIA_GOVERNOR_AI: AiFeed = { id: 'ca-gov', url: 'https://www.gov.ca.gov/?s=artificial+intelligence&feed=rss2', regulator: 'California Governor', jurisdiction: 'UNITED STATES (CALIFORNIA)', type: 'NEWS' };
// California's privacy regulator (CalPrivacy, the CPPA), which enforces the
// state's privacy law and makes its rules, including those on automated
// decisionmaking technology (ADMT). Every item is kept.
export const CALPRIVACY: AiFeed = { id: 'calprivacy', url: 'https://privacy.ca.gov/feed/', regulator: 'CalPrivacy (CPPA)', jurisdiction: 'UNITED STATES (CALIFORNIA)', type: 'NEWS', aiMentionOnly: true, privacy: 'all' };
// Colorado's attorney general enforces, and makes rules under, the Colorado AI Act
export const COLORADO_AG_AI: AiFeed = { id: 'co-ag', url: 'https://coag.gov/?s=artificial+intelligence&feed=rss2', regulator: 'Colorado AG', jurisdiction: 'UNITED STATES (COLORADO)', type: 'NEWS' };

// The Attorney General's rulemaking under Colorado's AI laws (the ADMT Act and
// the Chatbot Safety Act) is a page of its site rather than a post, so the
// search feed above never lists it. The page states the draft rules, when
// comments close and the hearing; it is read through WordPress's API.
export const COLORADO_AG_AI_RULEMAKING = 'https://coag.gov/wp-json/wp/v2/pages?slug=ai&_fields=id,date_gmt,modified_gmt,link,title,excerpt';

export async function fetchColoradoAiRulemaking(): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(COLORADO_AG_AI_RULEMAKING);
  return parseColoradoAiRulemaking(await res.json());
}

// Each revision of the page is its own notice, with the time it changed in its
// id: a notice's key points, and the dates found in them, are kept by id once
// read, so one notice updated in place would keep the dates of its first read.
// The feed shows the latest revision; earlier ones have the same link, so they
// are left out of the feed as copies of the same document but stay in the history.
export function parseColoradoAiRulemaking(pages: any): NormalizedNotice[] {
  // A page that moved or went would otherwise look like a quiet week
  if (!Array.isArray(pages) || pages.length === 0) throw new Error('Rulemaking page not found');
  const page = pages[0];
  const changedAt = toIso(`${page.modified_gmt}Z`);
  if (!changedAt || !page.link) throw new Error('Rulemaking page has no date or link');
  return [aiNotice({
    id: `coag-ai-rulemaking-${String(page.modified_gmt).replace(/\D/g, '')}`,
    ref: `Colorado AG rulemaking page, updated ${changedAt.slice(0, 10)}`,
    title: plainText(String(page.title?.rendered ?? '')),
    regulator: 'Colorado AG',
    jurisdiction: 'UNITED STATES (COLORADO)',
    jurisdictionCode: 'US',
    // The page asks for comments on the draft rules
    type: 'CONSULTATION',
    publishedAt: changedAt,
    summary: wholeSentences(plainText(String(page.excerpt?.rendered ?? ''))),
    url: String(page.link)
  })];
}

// WordPress cuts an excerpt off mid-sentence and ends it with "[…]"; keep the
// sentences it gives in full
function wholeSentences(excerpt: string): string | undefined {
  if (!/\[(?:…|\.\.\.)\]$/.test(excerpt)) return excerpt || undefined;
  return excerpt.match(/^.*[.!?](?=\s)/s)?.[0];
}

// A description that is only a link to the item (the California Governor's
// feed gives just "Source"), which says nothing about it
export const LINK_ONLY = /^(?:source|read more|continue reading|more|link)\W*$/i;

export async function fetchAiFeed(feed: AiFeed, limit: number): Promise<NormalizedNotice[]> {
  const items = await rssItems(feed.relayUrl ?? feed.url);
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

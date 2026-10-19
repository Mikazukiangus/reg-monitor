// Notices from the sources on AI rules and data privacy, tagged with their topics.
import { isAiRuleNews } from '../../src/lib/aiTopics.js';
import { mentionsPrivacy } from '../../src/lib/privacyTopics.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';

export interface TopicItem {
  id: string;
  ref: string;
  title: string;
  regulator: string;
  jurisdiction: string;
  jurisdictionCode: NormalizedNotice['jurisdictionCode'];
  type: string;
  publishedAt?: string;
  summary?: string;
  url: string;
  // Of the title and document, when not English
  language?: 'zh' | 'ja';
}

// A notice from a source on AI rules or data privacy, tagged with its topics
export function topicNotice(item: TopicItem, topics: string[]): NormalizedNotice {
  const format = formatOf(item.type, item.title);
  const sector = sectorOf(`${item.title} ${item.summary || ''}`);
  const score = estimateImpact(format);
  return {
    id: item.id,
    ref: item.ref,
    title: item.title,
    regulator: item.regulator,
    jurisdiction: item.jurisdiction,
    jurisdictionCode: item.jurisdictionCode,
    type: item.type,
    typeColorClass: getTypeColor(format),
    impactScore: score,
    issuedTimeAgo: item.publishedAt ? getRelativeTime(item.publishedAt) : 'Recently',
    publishedAt: item.publishedAt,
    ...(item.summary ? { summary: item.summary } : {}),
    tags: [item.regulator, format, sector, ...topics],
    sector,
    format,
    severity: severityFor(score),
    dossierUrl: item.url,
    isLiveFeed: true,
    ...(item.language ? { language: item.language } : {})
  };
}

// An item on AI rules whose title is also about personal data, and an item
// on data privacy that is also about AI rules, get both tags
export const aiNotice = (item: TopicItem) => topicNotice(item, mentionsPrivacy(item.title) ? ['AI rules', 'Data privacy'] : ['AI rules']);
export const privacyNotice = (item: TopicItem) => topicNotice(item, isAiRuleNews(item.title, item.summary) ? ['Data privacy', 'AI rules'] : ['Data privacy']);

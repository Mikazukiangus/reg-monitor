import { isAiRuleNews } from '../../shared/aiTopics.js';
import { fetchOrThrow } from '../http.js';
import type { NormalizedNotice } from '../notice.js';
import { lastPathPart, toIso } from '../text.js';
import { aiNotice } from './topics.js';

// The UK has no AI act; its regulators apply their existing rules (the PRA's
// and FCA's are read already). AI policy comes from the Department for
// Science, Innovation and Technology and the AI Security Institute, from
// GOV.UK's search API.
export const GOV_UK_AI = 'https://www.gov.uk/api/search.json?filter_organisations=department-for-science-innovation-and-technology&filter_organisations=ai-security-institute' +
  '&filter_content_purpose_supergroup=news_and_communications&filter_content_purpose_supergroup=guidance_and_regulation&filter_content_purpose_supergroup=policy_and_engagement' +
  '&order=-public_timestamp&fields=title&fields=description&fields=link&fields=public_timestamp&fields=format&fields=primary_publishing_organisation';

export async function fetchUkAiPolicy(limit = 4): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(`${GOV_UK_AI}&count=${limit <= 4 ? 100 : 300}`);
  const results: any[] = (await res.json()).results || [];
  return results
    .filter(r => isAiRuleNews(String(r.title), String(r.description || '')))
    .slice(0, limit)
    .map(r => {
      const aisi = (r.primary_publishing_organisation || []).includes('ai-security-institute');
      const regulator = aisi ? 'UK AI Security Institute' : 'UK DSIT';
      return aiNotice({
        id: `govuk-${lastPathPart(`https://www.gov.uk${r.link}`)}`.slice(0, 120),
        ref: `GOV.UK ${String(r.format || '').replace(/_/g, ' ')}`,
        title: String(r.title).trim(),
        regulator,
        jurisdiction: 'UNITED KINGDOM',
        jurisdictionCode: 'UK_EU',
        type: String(r.format || 'publication').replace(/_/g, ' ').toUpperCase(),
        publishedAt: toIso(r.public_timestamp),
        summary: r.description || undefined,
        url: `https://www.gov.uk${r.link}`
      });
    });
}

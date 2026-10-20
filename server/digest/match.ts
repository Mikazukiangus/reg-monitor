// Which notices go in the daily email digest: those published on the previous
// Singapore day that match the rules in digest-rules.ts.
import { ruleMatches, MatchableNotice } from '../../shared/alertRules.js';
import type { CustomAlertRule } from '../../shared/regulatory.js';

export interface DigestNotice extends MatchableNotice {
  id: string;
  ref: string;
  dossierUrl?: string;
  publishedAt?: string;
  statutoryDeadline?: string;
  deadlineDate?: string;
}

export interface DigestMatch {
  notice: DigestNotice;
  rules: string[];
}

export const SGT = 'Asia/Singapore';

// The Singapore calendar date (YYYY-MM-DD) the given number of days before now
export function singaporeDate(now: Date, daysBefore = 0): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SGT }).format(new Date(now.getTime() - daysBefore * 86_400_000));
}

// Notices published on `day` (Singapore time) that match at least one enabled rule
export function matchDigest(notices: DigestNotice[], rules: CustomAlertRule[], day: string): DigestMatch[] {
  const enabled = rules.filter(r => r.enabled);
  return notices
    .filter(n => n.publishedAt && singaporeDate(new Date(n.publishedAt)) === day)
    .map(notice => ({ notice, rules: enabled.filter(r => ruleMatches(r, notice)).map(r => r.name) }))
    .filter(m => m.rules.length > 0)
    .sort((a, b) => String(b.notice.publishedAt).localeCompare(String(a.notice.publishedAt)));
}

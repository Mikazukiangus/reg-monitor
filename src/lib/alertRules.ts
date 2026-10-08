// Alert rules, shared by the Alert Rules screen and the server's email digest
import type { CustomAlertRule } from '../types/regulatory';

export const DEFAULT_RULES: CustomAlertRule[] = [
  {
    id: 'rule-1',
    name: 'Consultations & Deadlines',
    jurisdictions: ['MAS', 'HKMA', 'SFC', 'PRA', 'SEC', 'SGX', 'ASX', 'FINRA', 'SC Malaysia'],
    minImpact: 7.5,
    keywords: ['consult', 'comments', 'deadline', 'feedback'],
    enabled: true
  },
  {
    id: 'rule-2',
    name: 'Digital Assets & Tokenisation',
    jurisdictions: ['MAS', 'HKMA', 'SFC', 'SEC', 'BIS', 'BCBS'],
    minImpact: 0,
    keywords: ['crypto', 'stablecoin', 'tokenis', 'digital asset', 'virtual asset', 'custody'],
    enabled: true
  },
  {
    id: 'rule-3',
    name: 'Enforcement Actions',
    jurisdictions: ['MAS', 'SEC', 'PRA', 'HKMA', 'SFC', 'ASIC', 'SGX', 'SC Malaysia'],
    minImpact: 0,
    keywords: ['enforcement', 'penalty', 'fine', 'prohibition', 'reprimand', 'sentenced'],
    enabled: true
  }
];

// The notice fields a rule looks at
export interface MatchableNotice {
  regulator: string;
  impactScore: number;
  title: string;
  summary?: string;
  keyPoints?: { points: string[] };
}

// Keywords match at the start of a word, so "tokenis" finds "tokenisation"
// but "fine" does not find "defined"
function keywordPattern(keyword: string): RegExp {
  return new RegExp(`\\b${keyword.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
}

// A notice matches when it is from a listed regulator, meets the impact
// threshold, and mentions at least one keyword (if any are set).
export function ruleMatches(rule: CustomAlertRule, notice: MatchableNotice): boolean {
  const regulator = notice.regulator.toLowerCase();
  if (rule.jurisdictions.length > 0 && !rule.jurisdictions.some(j => regulator.includes(j.toLowerCase()))) return false;
  if (notice.impactScore < rule.minImpact) return false;
  const keywords = rule.keywords.filter(k => k.trim());
  if (keywords.length === 0) return true;
  const text = [notice.title, notice.summary, ...(notice.keyPoints?.points || [])].join(' ');
  return keywords.some(k => keywordPattern(k).test(text));
}

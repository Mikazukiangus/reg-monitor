export type UrgencySeverity = 'critical' | 'high' | 'info';

export type JurisdictionCode =
  | 'SG'
  | 'HK'
  | 'AU'
  | 'JP'
  | 'UK_EU'
  | 'US'
  | 'GLOBAL';

export type SectorDomain =
  | 'FinTech & Digital Assets'
  | 'Banking & Capital Markets'
  | 'ESG & Sustainability'
  | 'AI Governance & Ethics'
  | 'AML/CFT & Sanctions';

export type InstrumentFormat =
  | 'Circulars'
  | 'Consultations'
  | 'Enforcement'
  | 'Guidelines'
  | 'Technical Standards';

export interface KeyFact {
  text: string;
  date?: string;
}

// Mirrors KeyPoints in summarize.ts
export interface KeyPoints {
  points: string[];
  facts: KeyFact[];
  refs: string[];
  sourceUrl?: string;
  method: 'extractive';
}

export interface RegulatoryNotice {
  id: string;
  ref: string;
  title: string;
  regulator: string;
  jurisdiction: string;
  jurisdictionCode: JurisdictionCode;
  type: string;
  typeColorClass: {
    bg: string;
    text: string;
  };
  impactScore: number;
  issuedTimeAgo: string;
  statutoryDeadline?: string;
  deadlineDate?: string;
  statusBadge?: {
    text: string;
    type: 'deadline' | 'immediate' | 'action' | 'standard';
  };
  summary?: string;
  // Sentences quoted from the source document (extractive, no AI model)
  keyPoints?: KeyPoints;
  tags: string[];
  sector: SectorDomain;
  format: InstrumentFormat;
  severity: UrgencySeverity;
  bookmarked?: boolean;
  dossierUrl?: string;
  isLiveFeed?: boolean;
  // ISO timestamp from the source; only set on live notices
  publishedAt?: string;
}

export interface DeadlineItem {
  id: string;
  title: string;
  subtitle: string;
  daysRemaining: number;
  dateStr: string;
  colorClass: string;
  textColorClass: string;
  noticeId?: string;
}

export interface AlertNotification {
  id: string;
  title: string;
  regulator: string;
  time: string;
  severity: UrgencySeverity;
  unread: boolean;
  linkId: string;
}

export interface CustomAlertRule {
  id: string;
  name: string;
  // Regulator names, matched against notice.regulator
  jurisdictions: string[];
  minImpact: number;
  keywords: string[];
  enabled: boolean;
}

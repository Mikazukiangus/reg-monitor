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
  aiSynthesis?: {
    title: string;
    points: string[];
  };
  summary?: string;
  impactedUnits?: string[];
  tags: string[];
  sector: SectorDomain;
  format: InstrumentFormat;
  severity: UrgencySeverity;
  bookmarked?: boolean;
  dossierUrl?: string;
  isLiveFeed?: boolean;
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

export interface LatencyMetric {
  jurisdiction: string;
  agency: string;
  pingMs: number;
  status: 'Operational' | 'Degraded';
}

export interface TrendBrief {
  id: string;
  tag: string;
  title: string;
  summary: string;
  severityColor: string;
  jurisdictions: string[];
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
  jurisdictions: string[];
  minImpact: number;
  keywords: string[];
  channels: ('slack' | 'webhook' | 'email')[];
  enabled: boolean;
  triggerCount: number;
}

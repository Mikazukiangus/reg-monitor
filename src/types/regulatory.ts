export type UrgencySeverity = 'critical' | 'high' | 'info';

export type JurisdictionCode =
  | 'SG'
  | 'MY'
  | 'HK'
  | 'AU'
  | 'JP'
  | 'KR'
  | 'CN'
  | 'UK_EU'
  | 'US'
  | 'GLOBAL';

export type SectorDomain =
  | 'Banking & Prudential'
  | 'Capital Markets & Listings'
  | 'Funds & Asset Management'
  | 'Insurance & Pensions'
  | 'FinTech, Payments & Digital Assets'
  | 'AI, Cyber & Tech Risk'
  | 'ESG & Sustainability'
  | 'AML/CFT & Financial Crime'
  | 'Conduct & Consumer Protection'
  | 'Monetary & Financial Stability'
  | 'General & Institutional';

export type InstrumentFormat =
  | 'Announcements'
  | 'Circulars'
  | 'Consultations'
  | 'Enforcement'
  | 'Guidelines'
  | 'Technical Standards';

export interface TagReasons {
  sectors: Partial<Record<SectorDomain, string[]>>;
  sectorFallback?: string;
  format: string;
  // How the impact score was reached, one line per step
  impact?: string[];
}

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
  // Text was read from a scanned PDF by OCR, so quotes may contain recognition errors
  ocr?: boolean;
  // Dates the document states for itself, each with its kind and sentence
  dates?: DocumentDate[];
}

// Mirrors DocumentDate in summarize.ts
export interface DocumentDate {
  kind: 'closes' | 'takesEffect' | 'complyBy';
  date: string;
  text: string;
  general?: boolean;
}

// A consultation and its conclusions, matched by regulator and title words
export interface RelatedLink {
  id: string;
  title: string;
  relation: 'consultation' | 'conclusion';
  publishedAt?: string;
  dossierUrl?: string;
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
  // The sentence the date was taken from, when it comes from the document's text
  deadlineQuote?: string;
  statusBadge?: {
    text: string;
    type: 'deadline' | 'immediate' | 'action' | 'standard';
  };
  summary?: string;
  // Sentences quoted from the source document (extractive, selected by TextRank)
  keyPoints?: KeyPoints;
  tags: string[];
  // Main sector, and all sectors given (main first, up to three)
  sector: SectorDomain;
  sectors?: SectorDomain[];
  format: InstrumentFormat;
  // Why the tags were given: the words that matched each sector, and the format rule
  tagging?: TagReasons;
  severity: UrgencySeverity;
  bookmarked?: boolean;
  dossierUrl?: string;
  isLiveFeed?: boolean;
  // ISO timestamp from the source
  publishedAt?: string;
  // From the stored history rather than the latest read of the source
  archived?: boolean;
  related?: RelatedLink[];
  // The title's and document's language, when not English
  language?: 'zh' | 'ja';
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

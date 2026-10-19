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
  | 'Data Privacy & Protection'
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

// Key points quoted from a notice's document (server/summarize.ts builds them)
export interface KeyFact {
  text: string;
  // ISO date (YYYY-MM-DD) when the sentence names a full calendar date
  date?: string;
}

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
  // Copies stored before October 2026 have this instead of dates
  closingDate?: KeyFact;
  // When the page says it was published (YYYY-MM-DD, or a full timestamp), for
  // feeds that give no date; null when the page was checked and gives none
  published?: string | null;
}

export type DateKind = 'closes' | 'takesEffect' | 'complyBy';

// A date a document states for itself: when comments close, when it takes
// effect, or when firms must comply by
export interface DocumentDate {
  kind: DateKind;
  // ISO date (YYYY-MM-DD)
  date: string;
  // The sentence it comes from, verbatim
  text: string;
  // "The consultation closes on ..." rather than a request for comments.
  // Counts only on a consultation: a digest or event notice may be quoting
  // another paper's closing date.
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
  // A bookmark snapshot saved in this browser, rather than a server refresh
  savedCopy?: boolean;
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

export type EndpointStatus = 'Operational' | 'Degraded' | 'Down' | 'Checking';

// A regulator's endpoint: its latest status check and, after a feed sync,
// the result of reading notices from it
export interface EndpointMetric {
  id: string;
  name: string;
  agency: string;
  jurisdiction: string;
  url: string;
  protocol: string;
  auth: string;
  status: EndpointStatus;
  statusCode?: number | null;
  pingMs: number | null;
  detail?: string;
  ingests?: boolean;
  // Result of the most recent notice sync for sources read from this endpoint
  // lastSuccessAt: when the oldest of its sources last fetched successfully
  sync?: { ok: boolean; count: number; error?: string; lastSuccessAt?: string | null };
}

// What a scheduled source check read (stored by the server, shown on the feed)
export interface CheckSummary {
  sources: { name: string; read: number; added: number; withoutKeyPoints: number }[];
  failed: { name: string; error: string }[];
  pageDatesFound: number;
}

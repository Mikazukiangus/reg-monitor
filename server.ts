import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { summarize, extractArticleText, extractPdfText, extractClosingDate, documentDates, htmlToText, KeyPoints, DocumentDate, DateKind } from './summarize.js';
import { matchDigest, renderDigest, sendWithResend, singaporeDate } from './digest.js';
import { DIGEST_RULES } from './digest-rules.js';
import { classifySectors, classifyFormat, SECTORS } from './src/lib/tagging.js';
import { assessImpact, severityOf } from './src/lib/impact.js';
import type { SectorDomain, InstrumentFormat, TagReasons } from './src/types/regulatory.js';
import { getDb, saveNotices, recentNotices, searchNotices, consultationCandidates, archiveStats, databaseUrl, storedNotices } from './db.js';
import { findRelated, RelatedCandidate, RelatedLink } from './src/lib/related.js';
import { dedupeByDocument } from './src/lib/dedupe.js';
import { rateLimit, reuseFor } from './src/lib/throttle.js';
import { isAiRuleNews, mentionsAi } from './src/lib/aiTopics.js';
import { createHash } from 'crypto';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

interface NormalizedNotice {
  id: string;
  ref: string;
  title: string;
  regulator: string;
  jurisdiction: string;
  jurisdictionCode: 'SG' | 'MY' | 'HK' | 'AU' | 'JP' | 'KR' | 'CN' | 'UK_EU' | 'US' | 'GLOBAL';
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
  keyPoints?: KeyPoints;
  tags: string[];
  sector: SectorDomain;
  sectors?: SectorDomain[];
  format: InstrumentFormat;
  tagging?: TagReasons;
  severity: 'critical' | 'high' | 'info';
  dossierUrl?: string;
  isLiveFeed?: boolean;
  publishedAt?: string;
  // From the stored history rather than the latest read of the source
  archived?: boolean;
  related?: RelatedLink[];
  // The title's and document's language, when not English
  language?: 'zh' | 'ja';
}


// Helper to calculate relative time
function getRelativeTime(dateString: string): string {
  try {
    const past = new Date(dateString).getTime();
    if (isNaN(past)) return 'Recently';
    const now = Date.now();
    const diffMs = now - past;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'Recently';
  }
}

// Helper to determine sector from text
// Sector and format by keyword rules (src/lib/tagging.ts). Sources call these
// while parsing; tagNotice then sets every sector with its reasons, using the
// summary and, once read, the key points.
const sectorOf = (text: string): SectorDomain => classifySectors({ title: text }).sectors[0];
const formatOf = (type: string, title: string): InstrumentFormat => classifyFormat(type, title).format;

// Sector names used before October 2026, still in older stored copies
const LEGACY_SECTORS = new Set(['FinTech & Digital Assets', 'Banking & Capital Markets', 'AI Governance & Ethics', 'AML/CFT & Sanctions']);

// Set a notice's sectors from its title, summary and key points, and record
// why. Run on every notice, including stored ones, so a rule change applies
// to the whole history.
// Format and impact score too: both come from the source's own category (the
// notice's type) and the title, the same way for every source and for notices
// read back from the history, so a rule change applies to all of them.
export function tagNotice<T extends NormalizedNotice>(notice: T): T {
  if (notice.id.startsWith('hkma-liquidity')) return notice;
  const text = [notice.summary, ...(notice.keyPoints?.points || [])].filter(Boolean).join(' ');
  const tagged = classifySectors({ title: notice.title, text, regulator: notice.regulator });
  const { format, reason: formatReason } = classifyFormat(notice.type, notice.title);
  const impact = assessImpact({ format, type: notice.type, title: notice.title, statutoryDeadline: notice.statutoryDeadline });
  return {
    ...notice,
    format,
    typeColorClass: getTypeColor(format),
    impactScore: impact.score,
    severity: impact.severity,
    sector: tagged.sectors[0],
    sectors: tagged.sectors,
    tags: [
      ...notice.tags.filter(t => !(SECTORS as string[]).includes(t) && !LEGACY_SECTORS.has(t) && !(FORMATS as string[]).includes(t)),
      format,
      ...tagged.sectors
    ],
    tagging: {
      sectors: tagged.reasons,
      ...(tagged.fallback ? { sectorFallback: tagged.fallback } : {}),
      format: formatReason,
      impact: impact.reasons
    }
  };
}

const FORMATS: InstrumentFormat[] = ['Circulars', 'Consultations', 'Enforcement', 'Guidelines', 'Technical Standards'];

// Helper for type color styles
function getTypeColor(format: string) {
  switch (format) {
    case 'Consultations':
      return { bg: 'bg-[#EDE9FE]', text: 'text-[#6D28D9]' };
    case 'Enforcement':
      return { bg: 'bg-[#FEF2F2]', text: 'text-[#DC2626]' };
    case 'Guidelines':
      return { bg: 'bg-[#DCFCE7]', text: 'text-[#15803D]' };
    case 'Technical Standards':
      return { bg: 'bg-[#F5F1E8]', text: 'text-[#57534E]' };
    default:
      return { bg: 'bg-[#E6F4F4]', text: 'text-[#0D5C63]' };
  }
}

const REG_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (RegSonar-Feed-Gateway/2.0)';
// FINRA's Cloudflare setup challenges clients that look like a browser but
// aren't one, and serves the feed to a client that names itself plainly
const PLAIN_USER_AGENT = 'RegSonar-Feed-Gateway/2.0';
const PLAIN_AGENT_HOSTS = new Set(['www.finra.org']);
const userAgentFor = (url: string) => (PLAIN_AGENT_HOSTS.has(new URL(url).host) ? PLAIN_USER_AGENT : REG_USER_AGENT);
const FETCH_TIMEOUT_MS = 8000;

// A first score while a source is read; tagNotice then sets the final score
// for every notice with the full rubric (src/lib/impact.ts)
const estimateImpact = (format: InstrumentFormat): number => assessImpact({ format, type: '', title: '' }).score;
const severityFor = severityOf;

function toIso(dateString: string | undefined): string | undefined {
  if (!dateString) return undefined;
  const t = new Date(dateString).getTime();
  return isNaN(t) ? undefined : new Date(t).toISOString();
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// Some sites limit how often they may be asked, so requests to them are spaced
// out. After an HTTP 429 a site is left alone for as long as its Retry-After
// header says, or 15 minutes when it doesn't say (FINRA doesn't).
const HOST_SPACING_MS: Record<string, number> = { 'www.finra.org': 4000 };
const RATE_LIMIT_PAUSE_MS = 15 * 60 * 1000;
const hostQueue = new Map<string, Promise<void>>();
const hostPausedUntil = new Map<string, number>();

class RateLimitedError extends Error {}

async function politeFetch(url: string): Promise<globalThis.Response> {
  const host = new URL(url).host;
  const pausedUntil = hostPausedUntil.get(host) ?? 0;
  if (Date.now() < pausedUntil) {
    throw new RateLimitedError(`HTTP 429: rate limited by the site, not asking again until ${new Date(pausedUntil).toISOString().slice(11, 16)} UTC`);
  }
  const spacing = HOST_SPACING_MS[host];
  if (spacing) {
    const previous = hostQueue.get(host) ?? Promise.resolve();
    hostQueue.set(host, previous.then(() => new Promise<void>(resolve => setTimeout(resolve, spacing))));
    await previous;
  }
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': userAgentFor(url) }
  });
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('retry-after'));
    hostPausedUntil.set(host, Date.now() + (retryAfter > 0 ? retryAfter * 1000 : RATE_LIMIT_PAUSE_MS));
  }
  return res;
}

async function fetchOrThrow(url: string): Promise<globalThis.Response> {
  const res = await politeFetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res;
}

// Date fields are only returned when requested by name
const FEDERAL_REGISTER_FIELDS = ['title', 'type', 'abstract', 'agencies', 'document_number', 'citation', 'publication_date', 'comments_close_on', 'effective_on', 'dates', 'html_url', 'pdf_url']
  .map((f) => `&fields[]=${f}`)
  .join('');

// Fetch US Federal Register API notices (SEC & CFTC)
async function fetchFederalRegister(limit = 4): Promise<NormalizedNotice[]> {
  const url = `https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=securities-and-exchange-commission&conditions[agencies][]=commodity-futures-trading-commission&order=newest&per_page=${limit}${FEDERAL_REGISTER_FIELDS}`;
  const res = await fetchOrThrow(url);
  const data = await res.json();
  const results = data.results || [];

  return results.map((doc: any, idx: number) => {
    const agencies = doc.agencies?.map((a: any) => a.raw_name || a.name).join(' & ') || 'US SEC & CFTC';
    const isSec = agencies.toLowerCase().includes('securities');
    return federalRegisterNotice(doc, idx, isSec ? 'US SEC' : 'US CFTC');
  });
}

function federalRegisterNotice(doc: any, idx: number, reg: string, extraTags: string[] = []): NormalizedNotice {
  const format = formatOf(doc.type || '', doc.title || '');
  const sector = sectorOf((doc.title || '') + ' ' + (doc.abstract || ''));
  const commentsClose: string | undefined = doc.comments_close_on || undefined;
  const effectiveOn: string | undefined = doc.effective_on || undefined;

  const score = estimateImpact(format);

  let statutoryDeadline = NO_DATE;
  let statusBadge: NormalizedNotice['statusBadge'] = { text: 'Published', type: 'standard' };
  if (commentsClose) {
    statutoryDeadline = `Comments close: ${commentsClose}`;
    statusBadge = { text: `Comments close: ${commentsClose}`, type: 'deadline' };
  } else if (effectiveOn) {
    statutoryDeadline = `Effective: ${effectiveOn}`;
    statusBadge = { text: `Effective: ${effectiveOn}`, type: 'action' };
  }

  const notice: NormalizedNotice = {
    id: `fedreg-${doc.document_number || idx}`,
    ref: `FedReg: ${doc.citation || doc.document_number}`,
    title: doc.title,
    regulator: reg,
    jurisdiction: 'UNITED STATES',
    jurisdictionCode: 'US',
    type: (doc.type || 'NOTICE').toUpperCase(),
    typeColorClass: getTypeColor(format),
    impactScore: score,
    issuedTimeAgo: getRelativeTime(doc.publication_date),
    publishedAt: toIso(doc.publication_date),
    statutoryDeadline,
    deadlineDate: commentsClose || effectiveOn,
    statusBadge,
    summary: doc.abstract || 'No abstract published in the Federal Register for this document.',
    keyPoints: doc.abstract
      ? summarize(doc.abstract, { datesText: doc.dates, sourceUrl: doc.html_url })
      : undefined,
    tags: [reg, format, 'Federal Register', sector, ...extraTags],
    sector,
    format,
    severity: severityFor(score),
    dossierUrl: doc.html_url || doc.pdf_url,
    isLiveFeed: true
  };
  // A date the text states (such as an exchange filing's comment deadline)
  // when the Federal Register's own fields give none
  return notice.keyPoints ? withKeyPointsUntagged(notice, notice.keyPoints) : notice;
}

// Fetch UK FCA RSS feed. The FCA site sits behind a Cloudflare bot challenge,
// so this usually fails with HTTP 403 from server environments.
async function fetchFcaFeed(limit = 3): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow('https://www.fca.org.uk/news/rss.xml');
  const xml = await res.text();
  const parsed = xmlParser.parse(xml);
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];
  const slice = (Array.isArray(items) ? items : [items]).slice(0, limit);

  return slice.map((item: any) => {
    const title = String(item.title || 'FCA publication');
    const description = item.description ? stripHtml(String(item.description)) : undefined;
    const format = formatOf('', title);
    const sector = sectorOf(title + ' ' + (description || ''));
    const score = estimateImpact(format);
    const slug = String(item.link || title).split('/').filter(Boolean).pop();

    return {
      id: `fca-${slug}`,
      ref: `FCA: ${slug}`,
      title,
      regulator: 'UK FCA',
      jurisdiction: 'UNITED KINGDOM',
      jurisdictionCode: 'UK_EU',
      type: format.toUpperCase(),
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item.pubDate),
      publishedAt: toIso(item.pubDate),
      summary: description,
      tags: ['FCA', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: item.link,
      isLiveFeed: true
    };
  });
}

// Fetch Bank of England Prudential Regulation Authority publications (RSS 2.0)
async function fetchPraPublications(limit = 4): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow('https://www.bankofengland.co.uk/rss/prudential-regulation-publications');
  const parsed = xmlParser.parse(await res.text());
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items]).slice(0, limit).map((item: any) => {
    const title = stripHtml(String(item.title));
    const description = item.description ? stripHtml(String(item.description)) : undefined;
    const format = formatOf('', title + ' ' + (description || ''));
    const sector = sectorOf(title + ' ' + (description || ''));
    const score = estimateImpact(format);
    const slug = String(item.link).split('/').filter(Boolean).pop();

    return {
      id: `pra-${slug}`,
      ref: `PRA ${String(item.link).split('/prudential-regulation/')[1]?.split('/')[0] || 'publication'}`,
      title,
      regulator: 'UK PRA',
      jurisdiction: 'UNITED KINGDOM',
      jurisdictionCode: 'UK_EU',
      type: format.toUpperCase(),
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item.pubDate),
      publishedAt: toIso(item.pubDate),
      summary: description,
      tags: ['PRA', 'Bank of England', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: item.link,
      isLiveFeed: true
    };
  });
}

// Routine market-operation releases that are not regulatory notices
const HKMA_ROUTINE_RELEASE = /tender (results|information)|exchange fund (bills|notes)|government bonds?\b|institutional bonds|monetary statistics/i;

// HKMA publishes official RSS feeds on www.hkma.gov.hk. That host is served by
// a different CDN from api.hkma.gov.hk, whose Alibaba Cloud WAF times out
// requests from cloud hosts such as Vercel, so notices come from RSS.
const HKMA_RSS = 'https://www.hkma.gov.hk/eng/other-information/rss';

interface HkmaFeed {
  file: string;
  idPrefix: string;
  refLabel: string;
  type: string;
  // Force a format for every item, otherwise classify by title
  format?: 'Consultations';
  limit: number;
}

async function fetchHkmaRss(feed: HkmaFeed, limit = feed.limit): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(`${HKMA_RSS}/${feed.file}`);
  const parsed = xmlParser.parse(await res.text());
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items])
    .filter((item: any) => item.title && !HKMA_ROUTINE_RELEASE.test(String(item.title)))
    .slice(0, limit)
    .map((item: any) => {
      const title = stripHtml(String(item.title));
      const format = feed.format || formatOf('', title);
      const sector = sectorOf(title);
      const score = estimateImpact(format);
      // Press releases end in /20261006-4/, BRDR documents in /20260922-1-EN
      const slug = String(item.link).split('/').filter(Boolean).pop()!.replace(/-EN$/, '');

      return {
        id: `${feed.idPrefix}-${slug}`,
        ref: `${feed.refLabel} ${slug}`,
        title,
        regulator: 'HKMA',
        jurisdiction: 'HONG KONG',
        jurisdictionCode: 'HK',
        type: feed.type,
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: getRelativeTime(item.pubDate),
        publishedAt: toIso(item.pubDate),
        tags: ['HKMA', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: String(item.link),
        isLiveFeed: true
      };
    });
}

const fetchHkmaPressReleases = (limit?: number) =>
  fetchHkmaRss({ file: 'rss_press-release.xml', idPrefix: 'hkma-pr', refLabel: 'HKMA Press Release', type: 'PRESS RELEASE', limit: 4 }, limit);
const fetchHkmaCirculars = (limit?: number) =>
  fetchHkmaRss({ file: 'rss_circulars.xml', idPrefix: 'hkma-cir', refLabel: 'HKMA Circular', type: 'CIRCULAR', limit: 3 }, limit);
const fetchHkmaConsultations = (limit?: number) =>
  fetchHkmaRss({ file: 'rss_consultations.xml', idPrefix: 'hkma-con', refLabel: 'HKMA Consultation', type: 'CONSULTATION', format: 'Consultations', limit: 3 }, limit);

// Fetch the latest HKMA interbank liquidity figures from the Daily Monetary
// Statistics page on www.hkma.gov.hk. The same figures are in the HKMA Open
// API, but its firewall blocks cloud servers (Vercel and GitHub Actions alike).
const HKMA_DAILY_STATS_PAGE = 'https://www.hkma.gov.hk/eng/data-publications-and-research/data-and-statistics/daily-monetary-statistics/';

export interface LiquidityDay {
  date: string; // YYYY-MM-DD, Hong Kong
  time: string; // HH:MM the page states the figures as at
  closingBalance: number; // HK$ million
  overnightHibor: number | null; // %
  hiborFixing1m: number | null; // %
  baseRate: number | null; // %
}

// Read the interbank liquidity figures from a Daily Monetary Statistics page.
// Returns null when the page has no figures (weekends and public holidays).
export function parseHkmaDailyStats(html: string): LiquidityDay | null {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  // The figure that follows a label, within the same table cell or the next
  const figureAfter = (label: string, value: RegExp) =>
    text.match(new RegExp(label + /[^%\d]{0,80}?/.source + value.source))?.[1];
  const rate = (label: string) => {
    const v = figureAfter(label, /([\d.]+)%/);
    return v ? Number(v) : null;
  };

  const closing = figureAfter('Closing Aggregate Balance', /([\d,]+) mn/);
  const asOf = text.match(/Date and Time \(日期和時間\) : (\d{2}:\d{2}), (\d{2})\/(\d{2})\/(\d{4})/);
  if (!closing || !asOf) return null;
  const [, time, day, month, year] = asOf;
  return {
    date: `${year}-${month}-${day}`,
    time,
    closingBalance: Number(closing.replace(/,/g, '')),
    overnightHibor: rate('Overnight HIBOR'),
    hiborFixing1m: rate('1-Month HIBOR Fixing'),
    baseRate: rate('Base Rate')
  };
}

// Most recent figures read by the liquidity source, for the chart
let latestLiquidity: LiquidityDay | null = null;

async function fetchHkmaLiquidity(): Promise<NormalizedNotice[]> {
  const html = await (await fetchOrThrow(HKMA_DAILY_STATS_PAGE)).text();
  let latest = parseHkmaDailyStats(html);
  // Until about 7pm Hong Kong time the page says today's figures "will be
  // published later today", so use the most recent dated page instead
  for (let i = 1; !latest && i <= 7; i++) {
    latest = await fetchLiquidityDay(hongKongDate(i));
  }
  if (!latest) throw new Error('No figures found on the HKMA Daily Monetary Statistics pages for the last 7 days');
  latestLiquidity = latest;

  const { date, time } = latest;
  const closing = latest.closingBalance.toLocaleString('en-US');
  const overnight = latest.overnightHibor?.toFixed(2);
  const fixing1m = latest.hiborFixing1m?.toFixed(5);
  const baseRate = latest.baseRate?.toFixed(2);
  // The page states Hong Kong time
  const publishedAt = toIso(`${date}T${time}:00+08:00`);
  const rates = [
    overnight && `overnight HIBOR ${overnight}%`,
    fixing1m && `1-month HIBOR fixing ${fixing1m}%`,
    baseRate && `discount window base rate ${baseRate}%`
  ].filter(Boolean);

  return [
    {
      id: `hkma-liquidity-${date}`,
      ref: `HKMA Daily Monetary Statistics ${date}`,
      title: `HKMA interbank liquidity: closing aggregate balance HK$${closing}M (${date})`,
      regulator: 'HKMA',
      jurisdiction: 'HONG KONG',
      jurisdictionCode: 'HK',
      type: 'MARKET DATA',
      typeColorClass: getTypeColor('Circulars'),
      // A data release, scored as the rubric scores one (src/lib/impact.ts)
      impactScore: 3,
      issuedTimeAgo: getRelativeTime(publishedAt ?? date),
      publishedAt,
      statusBadge: {
        text: `Closing Bal: HK$${closing}M`,
        type: 'standard'
      },
      summary: `Closing aggregate balance HK$${closing}M${rates.length ? `; ${rates.join('; ')}` : ''}. Figures as at ${time}, ${date} (Hong Kong time). Source: HKMA Daily Monetary Statistics page.`,
      tags: ['HKMA', 'Liquidity', 'Monetary & Financial Stability'],
      sector: 'Monetary & Financial Stability',
      format: 'Circulars',
      severity: 'info',
      dossierUrl: liquidityDayUrl(date),
      isLiveFeed: true
    }
  ];
}

// Search the MAS website's search API (behind mas.gov.sg/news). It is
// undocumented, and MAS serves a "Maintenance" page to non-browser user
// agents, so this relies on REG_USER_AGENT.
async function searchMas(contentTypes: string[], limit: number): Promise<any[]> {
  const params = new URLSearchParams();
  params.append('q', '*:*');
  params.append('fq', `mas_contenttype_s:(${contentTypes.map(t => `"${t}"`).join(' OR ')})`);
  params.append('sort', 'mas_date_tdt desc');
  params.append('rows', String(limit));
  params.append('wt', 'json');
  const res = await fetchOrThrow(`https://www.mas.gov.sg/api/v1/search?${params}`);
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error('MAS returned a non-JSON page (possibly maintenance or bot filtering)');
  }
  const data = await res.json();
  return data.response?.docs || [];
}

// MAS dates are Singapore local time even though they end in "Z"
const masDate = (value: unknown) => (value ? zonedToIso(String(value), 'Asia/Singapore') : undefined);

function masNotice(doc: any, type: string, format: NormalizedNotice['format']): NormalizedNotice {
  const title = stripHtml(String(doc.document_title_string_s));
  const summary = doc.document_shortsummary_t?.[0];
  const sector = sectorOf(title + ' ' + (summary || ''));
  const score = estimateImpact(format);
  const slug = String(doc.page_url_s).split('/').filter(Boolean).pop();
  const publishedAt = masDate(doc.mas_date_tdt);
  return {
    id: `mas-${slug}`,
    ref: `MAS ${doc.mas_contenttype_s}`,
    title,
    regulator: 'MAS',
    jurisdiction: 'SINGAPORE',
    jurisdictionCode: 'SG',
    type,
    typeColorClass: getTypeColor(format),
    impactScore: score,
    issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
    publishedAt,
    summary,
    tags: ['MAS', format, sector],
    sector,
    format,
    severity: severityFor(score),
    dossierUrl: `https://www.mas.gov.sg${doc.page_url_s}`,
    isLiveFeed: true
  };
}

// MAS media releases and enforcement actions
async function fetchMasMediaReleases(limit = 4): Promise<NormalizedNotice[]> {
  const docs = await searchMas(['Media Releases', 'Enforcement Actions Media Releases'], limit);
  return docs.map((doc) => {
    const title = stripHtml(String(doc.document_title_string_s));
    const isEnforcement = doc.mas_contenttype_s === 'Enforcement Actions Media Releases';
    return masNotice(doc, isEnforcement ? 'ENFORCEMENT ACTION' : 'MEDIA RELEASE', isEnforcement ? 'Enforcement' : formatOf('', title));
  });
}

// MAS consultation papers, with the closing date MAS publishes for each
async function fetchMasConsultations(limit = 3): Promise<NormalizedNotice[]> {
  const docs = await searchMas(['Consultations'], limit);
  return docs.map((doc) => {
    const notice = masNotice(doc, 'CONSULTATION', 'Consultations');
    const closes = masDate(doc.masconsultation_closingdate_tdt);
    if (!closes) return notice;
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date(closes));
    return { ...notice, ...closingDateFields(date) };
  });
}

// MAS circulars and guidelines
async function fetchMasRegulatoryPublications(limit = 3): Promise<NormalizedNotice[]> {
  const docs = await searchMas(['Circulars', 'Guidelines'], limit);
  return docs.map((doc) =>
    masNotice(doc, doc.mas_contenttype_s === 'Guidelines' ? 'GUIDELINES' : 'CIRCULAR', doc.mas_contenttype_s === 'Guidelines' ? 'Guidelines' : 'Circulars')
  );
}

// Fetch BIS media releases (RSS 1.0 / RDF), which include Basel Committee announcements
async function fetchBisPressReleases(limit = 4): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow('https://www.bis.org/doclist/all_pressrels.rss');
  const parsed = xmlParser.parse(await res.text());
  const items = parsed['rdf:RDF']?.item;
  if (!items) {
    throw new Error('Response was not an RSS feed');
  }

  return (Array.isArray(items) ? items : [items]).slice(0, limit).map((item: any) => {
    const title = stripHtml(String(item.title));
    const description = item.description ? stripHtml(String(item.description)) : undefined;
    const format = formatOf('', title);
    const sector = sectorOf(title + ' ' + (description || ''));
    const score = estimateImpact(format);
    const slug = String(item.link).split('/').filter(Boolean).pop();
    const regulator = /basel committee/i.test(title + ' ' + (description || '')) ? 'BCBS' : 'BIS';

    return {
      id: `bis-${slug}`,
      ref: `BIS Media Release ${slug?.slice(0, 8)}`,
      title,
      regulator,
      jurisdiction: 'GLOBAL',
      jurisdictionCode: 'GLOBAL',
      type: 'MEDIA RELEASE',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item['dc:date']),
      publishedAt: toIso(item['dc:date']),
      summary: description,
      tags: [regulator, format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: item.link,
      isLiveFeed: true
    };
  });
}

// Hong Kong Securities and Futures Commission official RSS feeds (RSS 2.0)
const SFC_RSS = 'https://www.sfc.hk/en/RSS-Feeds';

interface SfcFeed {
  path: string;
  idPrefix: string;
  type: string;
  format?: 'Consultations';
  limit: number;
}

async function fetchSfcRss(feed: SfcFeed, limit = feed.limit): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(`${SFC_RSS}/${feed.path}`);
  const parsed = xmlParser.parse(await res.text());
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items]).slice(0, limit).map((item: any) => {
    // Circular titles start with the audience on its own line ("Circular to Intermediaries")
    const title = stripHtml(String(item.title).split('\n').pop() || String(item.title));
    const refNo = String(item.guid?.['#text'] ?? item.guid ?? '').trim()
      || new URL(String(item.link)).searchParams.get('refNo')
      || title;
    const format = feed.format || formatOf('', title);
    const sector = sectorOf(title);
    const score = estimateImpact(format);

    return {
      id: `${feed.idPrefix}-${refNo}`,
      ref: `SFC ${refNo}`,
      title,
      regulator: 'SFC',
      jurisdiction: 'HONG KONG',
      jurisdictionCode: 'HK',
      type: feed.type,
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item.pubDate),
      publishedAt: toIso(item.pubDate),
      tags: ['SFC', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: String(item.link),
      isLiveFeed: true
    };
  });
}

const fetchSfcPressReleases = (limit?: number) =>
  fetchSfcRss({ path: 'Press-releases', idPrefix: 'sfc-pr', type: 'PRESS RELEASE', limit: 4 }, limit);
const fetchSfcCirculars = (limit?: number) =>
  fetchSfcRss({ path: 'Circulars', idPrefix: 'sfc-cir', type: 'CIRCULAR', limit: 3 }, limit);
const fetchSfcConsultations = (limit?: number) =>
  fetchSfcRss({ path: 'Consultations-and-Conclusions', idPrefix: 'sfc-con', type: 'CONSULTATION', format: 'Consultations', limit: 3 }, limit);

// Convert a local date-time without offset ("2026-10-07T11:13:00") in the
// given time zone to an ISO timestamp
export function zonedToIso(local: string, timeZone: string): string | undefined {
  const asUtc = new Date(`${local.slice(0, 19)}Z`).getTime();
  if (isNaN(asUtc)) return undefined;
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(asUtc))
    .find(p => p.type === 'timeZoneName')?.value.match(/GMT([+-])(\d{2}):(\d{2})/);
  const offsetMs = offset ? (offset[1] === '-' ? -1 : 1) * (Number(offset[2]) * 60 + Number(offset[3])) * 60_000 : 0;
  return new Date(asUtc - offsetMs).toISOString();
}

// ASIC has no RSS feed. Its media releases page is filled in from this JSON
// file on ASIC's own download server, which is read here in the same way.
const ASIC_MEDIA_RELEASES = 'https://download.asic.gov.au/asic-nga/data/newsroom/newsroom-mr-latest.json';

async function fetchAsicMediaReleases(limit = 4): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(ASIC_MEDIA_RELEASES);
  const items = await res.json();
  if (!Array.isArray(items)) {
    throw new Error('ASIC media releases file was not a list');
  }

  return items
    .filter((item: any) => item.name && item.url && item.publishedDate)
    // publishedDate is Sydney local time even though it ends in "Z"
    .map((item: any) => ({ item, publishedAt: zonedToIso(String(item.publishedDate), 'Australia/Sydney') }))
    .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
    .slice(0, limit)
    .map(({ item, publishedAt }) => {
      const docNumber = String(item.documentNumber || '');
      const title = stripHtml(String(item.name)).replace(new RegExp(`^${docNumber}\\s+`), '');
      const summary = item.metaDescription ? stripHtml(String(item.metaDescription)) : undefined;
      const isEnforcement = Array.isArray(item.metaFunction) && item.metaFunction.includes('enforcement');
      const format = isEnforcement ? 'Enforcement' : formatOf('', title);
      const sector = sectorOf(title + ' ' + (summary || ''));
      const score = estimateImpact(format);

      return {
        id: `asic-${docNumber || item.id}`,
        ref: `ASIC ${docNumber || 'media release'}`,
        title,
        regulator: 'ASIC',
        jurisdiction: 'AUSTRALIA',
        jurisdictionCode: 'AU' as const,
        type: isEnforcement ? 'ENFORCEMENT ACTION' : 'MEDIA RELEASE',
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
        publishedAt,
        summary,
        tags: ['ASIC', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: new URL(String(item.url), 'https://asic.gov.au').toString(),
        isLiveFeed: true
      };
    });
}

// Japan Financial Services Agency English "What's New" RSS feed. Titles are
// "Category,Title". Press conference transcripts and the weekly newsletter
// are left out because they are not regulatory notices.
const JFSA_RSS = 'https://www.fsa.go.jp/fsaEnNewsList_rss2.xml';
const JFSA_SKIPPED = /^(press conferences|international)$/i;

async function fetchJfsaNews(limit = 4): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(JFSA_RSS);
  const parsed = xmlParser.parse(await res.text());
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items])
    .map((item: any) => {
      const raw = stripHtml(String(item.title));
      const comma = raw.indexOf(',');
      const category = comma > 0 ? raw.slice(0, comma).trim() : '';
      return { item, category, title: comma > 0 ? raw.slice(comma + 1).trim() : raw };
    })
    .filter(({ category, title }) => !JFSA_SKIPPED.test(category) && !/^FSA Weekly Review/i.test(title))
    .slice(0, limit)
    .map(({ item, category, title }) => {
      const format = formatOf(category, title);
      const sector = sectorOf(title);
      const score = estimateImpact(format);
      // Dates end in "JST", which JavaScript does not parse
      const pubDate = String(item.pubDate || '').replace(/\bJST$/, '+0900');
      const slug = String(item.link).replace(/^https?:\/\/www\.fsa\.go\.jp\/en\//, '').replace(/\.html?$/, '').replace(/[^\w-]+/g, '-');

      return {
        id: `jfsa-${slug}`,
        ref: `JFSA ${category || 'News'}`,
        title,
        regulator: 'JFSA',
        jurisdiction: 'JAPAN',
        jurisdictionCode: 'JP' as const,
        type: (category || 'NEWS').toUpperCase(),
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: getRelativeTime(pubDate),
        publishedAt: toIso(pubDate),
        tags: ['JFSA', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: String(item.link),
        isLiveFeed: true
      };
    });
}

// Items of an RSS 2.0 feed, or an error if the response is not one
async function rssItems(url: string): Promise<any[]> {
  const parsed = xmlParser.parse(await (await fetchOrThrow(url)).text());
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];
  return Array.isArray(items) ? items : [items];
}

const lastPathPart = (url: string) => new URL(url).pathname.split('/').filter(Boolean).pop()!.replace(/\.\w+$/, '');

// Bank Negara Malaysia: press releases, from the table on each year's press
// release page. (BNM also has an Atom feed, but Cloudflare challenges
// automated requests for it, while the page itself is served normally.)
const bnmYearPage = (year: number) => `https://www.bnm.gov.my/press-release-${year}`;
const BNM_ROW = /<td>\s*<p>\s*(\d{1,2} \w{3} \d{4})\s*<\/p>\s*<\/td>\s*<td>\s*<p>\s*<a href="([^"]+)">([\s\S]*?)<\/a>/g;

export function parseBnmPressReleases(html: string): { title: string; url: string; date: string }[] {
  const out: { title: string; url: string; date: string }[] = [];
  for (const m of html.matchAll(BNM_ROW)) {
    const date = new Date(`${m[1]} UTC`);
    if (isNaN(date.getTime())) continue;
    out.push({ title: stripHtml(m[3]), url: new URL(m[2], 'https://www.bnm.gov.my').toString(), date: date.toISOString().slice(0, 10) });
  }
  return out;
}

async function fetchBnmPressReleases(limit = 4): Promise<NormalizedNotice[]> {
  const year = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric' }).format(new Date()));
  let releases = parseBnmPressReleases(await (await fetchOrThrow(bnmYearPage(year))).text());
  // Early in the year, last year's page fills the list
  if (releases.length < limit) {
    releases = releases.concat(parseBnmPressReleases(await (await fetchOrThrow(bnmYearPage(year - 1))).text()));
  }
  if (releases.length === 0) throw new Error('No press releases found on the BNM page');
  return releases.slice(0, limit).map(r => {
    const format = formatOf('', r.title);
    const sector = sectorOf(r.title);
    const score = estimateImpact(format);
    // Dates are Malaysian days with no time
    const publishedAt = zonedToIso(`${r.date}T00:00:00`, 'Asia/Kuala_Lumpur');
    return {
      id: `bnm-${lastPathPart(r.url)}`.slice(0, 120),
      ref: 'BNM Press Release',
      title: r.title,
      regulator: 'BNM',
      jurisdiction: 'MALAYSIA',
      jurisdictionCode: 'MY' as const,
      type: format === 'Enforcement' ? 'ENFORCEMENT ACTION' : 'PRESS RELEASE',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
      publishedAt,
      tags: ['BNM', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: r.url,
      isLiveFeed: true
    };
  });
}

// Securities Commission Malaysia: media releases. The page has no feed, but
// carries its whole list as data (title, description, address, date), newest first.
const SC_MEDIA_RELEASES = 'https://www.sc.com.my/resources/media/media-release';
const SC_RELEASE = /\{"Page Name":"((?:[^"\\]|\\.)*)","Page Description":"((?:[^"\\]|\\.)*)","Page Address":"((?:[^"\\]|\\.)*)","Display Date 2":"([^"]*)"/g;

export function parseScMediaReleases(html: string): { title: string; description: string; url: string; date: string }[] {
  const seen = new Set<string>();
  const out: { title: string; description: string; url: string; date: string }[] = [];
  for (const m of html.matchAll(SC_RELEASE)) {
    const address = JSON.parse(`"${m[3]}"`) as string;
    if (!address.startsWith('resources/media/media-release/') || seen.has(address)) continue;
    seen.add(address);
    const date = new Date(`${m[4]} UTC`);
    if (isNaN(date.getTime())) continue;
    out.push({
      title: stripHtml(JSON.parse(`"${m[1]}"`)),
      description: stripHtml(JSON.parse(`"${m[2]}"`)),
      url: `https://www.sc.com.my/${address}`,
      date: date.toISOString().slice(0, 10)
    });
  }
  return out;
}

async function fetchScMediaReleases(limit = 4): Promise<NormalizedNotice[]> {
  const releases = parseScMediaReleases(await (await fetchOrThrow(SC_MEDIA_RELEASES)).text());
  if (releases.length === 0) throw new Error('No media releases found on the SC page');
  return releases.slice(0, limit).map(r => {
    const format = formatOf('', r.title);
    const sector = sectorOf(`${r.title} ${r.description}`);
    const score = estimateImpact(format);
    // Dates are Malaysian days with no time
    const publishedAt = zonedToIso(`${r.date}T00:00:00`, 'Asia/Kuala_Lumpur');
    return {
      id: `sc-my-${lastPathPart(r.url)}`.slice(0, 120),
      ref: 'SC Malaysia Media Release',
      title: r.title,
      regulator: 'SC Malaysia',
      jurisdiction: 'MALAYSIA',
      jurisdictionCode: 'MY' as const,
      type: format === 'Enforcement' ? 'ENFORCEMENT ACTION' : 'MEDIA RELEASE',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
      publishedAt,
      summary: r.description || undefined,
      tags: ['SC Malaysia', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: r.url,
      isLiveFeed: true
    };
  });
}

// Hong Kong Exchanges and Clearing: regulatory announcements (disciplinary
// actions, listing consultations and conclusions) from its official RSS feed
const HKEX_REGULATORY_RSS = 'https://www.hkex.com.hk/Services/RSS-Feeds/regulatory-announcements?sc_lang=en';

async function fetchHkexRegulatory(limit = 4): Promise<NormalizedNotice[]> {
  const items = await rssItems(HKEX_REGULATORY_RSS);
  return items.slice(0, limit).map((item: any) => {
    const title = stripHtml(String(item.title));
    const format = /disciplinary|censure|sanction/i.test(title) ? 'Enforcement' : formatOf('', title);
    const sector = sectorOf(title);
    const score = estimateImpact(format);
    const slug = lastPathPart(String(item.link));
    return {
      id: `hkex-${slug}`,
      ref: `HKEX Regulatory Announcement ${slug.replace(/news$/, '')}`,
      title,
      regulator: 'HKEX',
      jurisdiction: 'HONG KONG',
      jurisdictionCode: 'HK' as const,
      type: format === 'Enforcement' ? 'DISCIPLINARY ACTION' : 'REGULATORY ANNOUNCEMENT',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item.pubDate),
      publishedAt: toIso(item.pubDate),
      tags: ['HKEX', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: String(item.link),
      isLiveFeed: true
    };
  });
}

// Financial Stability Board publications and press releases (official RSS).
// Meeting notices of its regional consultative groups are left out.
const FSB_RSS = 'https://www.fsb.org/feed/';

async function fetchFsbPublications(limit = 4): Promise<NormalizedNotice[]> {
  const items = await rssItems(FSB_RSS);
  return items
    .filter((item: any) => !/regional consultative group|report of the auditor/i.test(String(item.title)))
    .slice(0, limit)
    .map((item: any) => {
      const title = stripHtml(String(item.title));
      const description = item.description ? stripHtml(String(item.description)) : undefined;
      const format = formatOf('', title);
      const sector = sectorOf(title + ' ' + (description || ''));
      const score = estimateImpact(format);
      const slug = lastPathPart(String(item.link));
      return {
        id: `fsb-${slug}`,
        ref: `FSB ${new Date(item.pubDate).toISOString().slice(0, 10)}`,
        title,
        regulator: 'FSB',
        jurisdiction: 'GLOBAL',
        jurisdictionCode: 'GLOBAL' as const,
        type: 'PUBLICATION',
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: getRelativeTime(item.pubDate),
        publishedAt: toIso(item.pubDate),
        summary: description,
        tags: ['FSB', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: String(item.link),
        isLiveFeed: true
      };
    });
}

// European Securities and Markets Authority news (official RSS). Items have no
// pubDate; the date is in a <time datetime="..."> tag inside the description.
const ESMA_RSS = 'https://www.esma.europa.eu/rss.xml';

async function fetchEsmaNews(limit = 4): Promise<NormalizedNotice[]> {
  const items = await rssItems(ESMA_RSS);
  return items.slice(0, limit).map((item: any) => {
    const title = stripHtml(String(item.title));
    const html = String(item.description || '');
    const published = html.match(/datetime="([^"]+)"/)?.[1] || item.pubDate;
    const section = html.match(/field--name-field-news-section[\s\S]*?field__item">([^<]+)</)?.[1]?.trim();
    const format = formatOf(section || '', title);
    const sector = sectorOf(title + ' ' + (section || ''));
    const score = estimateImpact(format);
    const slug = lastPathPart(String(item.link));
    return {
      id: `esma-${slug}`.slice(0, 120),
      ref: `ESMA News${section ? ` · ${section}` : ''}`,
      title,
      regulator: 'ESMA',
      jurisdiction: 'EUROPEAN UNION',
      jurisdictionCode: 'UK_EU' as const,
      type: 'NEWS',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: published ? getRelativeTime(published) : 'Recently',
      publishedAt: toIso(published),
      tags: ['ESMA', format, sector, ...(section ? [section] : [])],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: String(item.link),
      isLiveFeed: true
    };
  });
}

// "Comments close" or "Comments closed" fields for a closing date (YYYY-MM-DD)
// that the source publishes
function closingDateFields(date: string): Partial<NormalizedNotice> {
  if (date < hongKongDate()) {
    return { statutoryDeadline: `Comments closed: ${date}`, statusBadge: { text: `Comments closed: ${date}`, type: 'standard' } };
  }
  return {
    deadlineDate: date,
    statutoryDeadline: `Comments close: ${date}`,
    statusBadge: { text: `Comments close: ${date}`, type: 'deadline' }
  };
}

const singaporeDay = (unixSeconds: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date(unixSeconds * 1000));

// Singapore Exchange Regulation (SGX RegCo). Its pages are filled in from SGX's
// own content API, which the server reads directly: the lists of public
// consultations (with issue and closing dates) and public disciplinary
// actions, and the SGX Group media list filtered to regulatory items.
const SGX_CONTENT_API = 'https://api2.sgx.com/regco/content-api';
const SGX_QUERY_ID = 'e4da21521b39e5324f96273260acfd8e1a9d1e5e';
const SGX_REGULATORY_MEDIA = new Set(['Regulatory Announcement', 'Public Regulatory Statements', "Regulator's Column"]);

async function sgxQuery(name: string, variables: Record<string, unknown>): Promise<any> {
  const params = new URLSearchParams({ queryId: `${SGX_QUERY_ID}:${name}`, variables: JSON.stringify({ ...variables, lang: 'EN' }) });
  const res = await fetchOrThrow(`${SGX_CONTENT_API}?${params}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`SGX content API: ${String(body.errors[0].message).slice(0, 80)}`);
  return body.data;
}

async function sgxList(name: string, limit: number): Promise<any[]> {
  const data = await sgxQuery(name, { limit, offset: 0 });
  return (data?.list?.results || []).map((r: any) => r.data);
}

// Content API paths start with the site name: /regco/... is on regco.sgx.com,
// /sgxgroup/... on www.sgxgroup.com
export function sgxPublicUrl(apiPath: string): string {
  if (apiPath.startsWith('/regco/')) return `https://regco.sgx.com${apiPath.slice('/regco'.length)}`;
  if (apiPath.startsWith('/sgxgroup/')) return `https://www.sgxgroup.com${apiPath.slice('/sgxgroup'.length)}`;
  return `https://www.sgx.com${apiPath}`;
}

function sgxNotice(item: any, opts: { idPrefix: string; type: string; format: NormalizedNotice['format']; unixDate: number }): NormalizedNotice {
  const title = stripHtml(String(item.title));
  const sector = sectorOf(title);
  const score = estimateImpact(opts.format);
  const path = String(item.link?.url || '');
  const publishedAt = opts.unixDate ? new Date(opts.unixDate * 1000).toISOString() : undefined;
  return {
    id: `${opts.idPrefix}-${path.split('/').filter(Boolean).pop()}`.slice(0, 120),
    ref: `SGX RegCo ${opts.type.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}`,
    title,
    regulator: 'SGX RegCo',
    jurisdiction: 'SINGAPORE',
    jurisdictionCode: 'SG',
    type: opts.type,
    typeColorClass: getTypeColor(opts.format),
    impactScore: score,
    issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
    publishedAt,
    tags: ['SGX RegCo', opts.format, sector],
    sector,
    format: opts.format,
    severity: severityFor(score),
    dossierUrl: sgxPublicUrl(path),
    isLiveFeed: true
  };
}

async function fetchSgxConsultations(limit = 3): Promise<NormalizedNotice[]> {
  const items = await sgxList('public_consultations_list', limit);
  return items.map(item => {
    const notice = sgxNotice(item, { idPrefix: 'sgx-con', type: 'CONSULTATION', format: 'Consultations', unixDate: item.dateIssue });
    return item.dateClosed ? { ...notice, ...closingDateFields(singaporeDay(item.dateClosed)) } : notice;
  });
}

async function fetchSgxDisciplinaryActions(limit = 3): Promise<NormalizedNotice[]> {
  const items = await sgxList('public_disciplinary_actions_list', limit);
  return items.map(item => sgxNotice(item, { idPrefix: 'sgx-disc', type: 'DISCIPLINARY ACTION', format: 'Enforcement', unixDate: item.dateAnnounced }));
}

const sgxNames = (field: any[] | null | undefined): string[] =>
  (field || []).map(t => t?.data?.data?.name).filter(Boolean);

// Speeches are SGX Group's as a whole; those given for SGX RegCo say so in the title
const SGX_REGCO_SPEAKER = /SGX RegCo|Singapore Exchange Regulation/i;

async function fetchSgxRegulatoryNews(limit = 3): Promise<NormalizedNotice[]> {
  // Most of the media list is listings, awards and results; regulatory items
  // are a few a month, so a wider page is read and filtered
  const items = await sgxList('media_centre_list', Math.min(400, Math.max(100, limit * 12)));
  return items
    .filter(item => {
      const types = sgxNames(item.mediaCentreType);
      return types.some(t => SGX_REGULATORY_MEDIA.has(t))
        || sgxNames(item.newsTopic).includes('Regulation')
        || (types.includes('Speeches') && SGX_REGCO_SPEAKER.test(String(item.title)));
    })
    .slice(0, limit)
    .map(item => {
      const title = stripHtml(String(item.title));
      const types = sgxNames(item.mediaCentreType);
      const format = formatOf('', title);
      const type = types.includes("Regulator's Column") ? "REGULATOR'S COLUMN"
        : types.includes('Speeches') ? 'SPEECH'
        : 'REGULATORY ANNOUNCEMENT';
      return sgxNotice(item, { idPrefix: 'sgx-news', type, format, unixDate: item.articleDate });
    });
}

// The text of an SGX page, from the rich-text blocks the content API returns
async function fetchSgxDocText(pageUrl: string): Promise<string | null> {
  const url = new URL(pageUrl);
  const site = url.host === 'regco.sgx.com' ? 'regco' : url.host === 'www.sgxgroup.com' ? 'sgxgroup' : null;
  if (!site) return null;
  const data = await sgxQuery('page', { path: `/${site}${url.pathname}` });
  const blocks: string[] = [];
  JSON.stringify(data, (key, value) => {
    if (key === 'processed' && typeof value === 'string') blocks.push(value);
    return value;
  });
  return htmlToText(blocks.join('\n'));
}

// ASX public consultations: a dated table on ASX's consultations page. Each
// entry says what ASX published and, for consultations, when submissions close.
const ASX_CONSULTATIONS_PAGE = 'https://www.asx.com.au/about/regulation/consultations-and-submissions';

export function parseAsxConsultations(html: string): { date: string; text: string; links: string[] }[] {
  const start = html.search(/ASX public consultations<\/h\d>/i);
  const table = html.slice(start).match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (start < 0 || !table) return [];
  const rows: { date: string; text: string; links: string[] }[] = [];
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = row.match(/<td[\s\S]*?<\/td>/gi) || [];
    const day = cells[0] && stripHtml(cells[0]).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!day || cells.length < 2) continue;
    const links = [...cells[1].matchAll(/href="([^"]+\.pdf)"/gi)].map(m => new URL(m[1], ASX_CONSULTATIONS_PAGE).toString());
    rows.push({
      date: `${day[3]}-${day[2].padStart(2, '0')}-${day[1].padStart(2, '0')}`,
      text: htmlToText(cells[1]),
      links
    });
  }
  return rows;
}

async function fetchAsxConsultations(limit = 3): Promise<NormalizedNotice[]> {
  const rows = parseAsxConsultations(await (await fetchOrThrow(ASX_CONSULTATIONS_PAGE)).text());
  if (rows.length === 0) throw new Error('No consultation table found on the ASX page');
  return rows
    .filter(row => !/^On \w+day[^,]*,[^.]*\b(recording|webinar|briefing|forum)\b|^ASX has made available a recording/i.test(row.text))
    .slice(0, limit)
    .map((row, i) => {
    // "On Wednesday 30 September 2026, ASX published a consultation paper on ..."
    const first = row.text.split(/(?<=\.)\s+(?=[A-Z])/)[0].replace(/^On \w+day,? \d{1,2} \w+ \d{4},\s*/i, '');
    const title = first.charAt(0).toUpperCase() + first.slice(1);
    const format = formatOf('', title);
    const sector = sectorOf(row.text);
    const score = estimateImpact(format);
    const publishedAt = zonedToIso(`${row.date}T00:00:00`, 'Australia/Sydney');
    const closing = /response|feedback received/i.test(title) ? undefined : extractClosingDate(row.text.split(/(?<=[.;])\s+/));
    return {
      id: `asx-con-${row.date}-${row.links[0] ? lastPathPart(row.links[0]).slice(0, 60) : i}`,
      ref: `ASX Consultation ${row.date}`,
      title: title.length > 220 ? `${title.slice(0, 217)}...` : title,
      regulator: 'ASX',
      jurisdiction: 'AUSTRALIA',
      jurisdictionCode: 'AU' as const,
      type: 'CONSULTATION',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
      publishedAt,
      summary: row.text.length > 600 ? `${row.text.slice(0, 597)}...` : row.text,
      tags: ['ASX', format, sector],
      sector,
      format,
      severity: severityFor(score),
      // The paper itself where linked, so key points come from it
      dossierUrl: row.links[0] || ASX_CONSULTATIONS_PAGE,
      isLiveFeed: true,
      ...(closing?.date ? closingDateFields(closing.date) : {})
    };
  });
}

// FINRA (the US self-regulatory organisation for broker-dealers): regulatory
// and information notices from its official RSS feed. Board election notices
// are left out. Feed titles are only the notice number ("Regulatory Notice
// 26-16"), so the title adds the opening of FINRA's own summary from the feed.
// FINRA rate-limits quickly, so notice pages are only fetched for key points.
const FINRA_NOTICES_RSS = 'https://www.finra.org/rules-guidance/notices/rss';

export function finraTitle(number: string, summary: string | undefined): string {
  const first = summary?.split(/(?<=\.)\s+(?=[A-Z])/)[0]?.replace(/\.$/, '');
  if (!first) return number;
  return `${number}: ${first.length > 150 ? `${first.slice(0, 147).replace(/\s+\S*$/, '')}...` : first}`;
}

async function fetchFinraNotices(limit = 4): Promise<NormalizedNotice[]> {
  const items = (await rssItems(FINRA_NOTICES_RSS)).filter((item: any) => !/^election notice/i.test(String(item.title)));
  return items.slice(0, limit).map((item: any) => {
    const number = stripHtml(String(item.title));
    const link = String(item.link);
    const summary = item.description ? htmlToText(String(item.description)).replace(/^Summary\s*/i, '').trim() || undefined : undefined;
    const title = finraTitle(number, summary);
    const format = /^information notice/i.test(number) ? 'Circulars' : formatOf('', `${title} ${summary || ''}`);
    const sector = sectorOf(`${title} ${summary || ''}`);
    const score = estimateImpact(format);
    return {
      id: `finra-${lastPathPart(link)}`,
      ref: `FINRA ${number}`,
      title,
      regulator: 'FINRA',
      jurisdiction: 'UNITED STATES',
      jurisdictionCode: 'US' as const,
      type: /^regulatory notice/i.test(number) ? 'REGULATORY NOTICE' : 'NOTICE',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(item.pubDate),
      publishedAt: toIso(item.pubDate),
      summary,
      tags: ['FINRA', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: link,
      isLiveFeed: true
    };
  });
}

// Japan Exchange Group rule revisions: one dated table per exchange, each
// row linking to an English outline of the change (PDF)
const JPX_REVISIONS = [
  { page: 'index.html', regulator: 'TSE', name: 'Tokyo Stock Exchange' },
  { page: '01.html', regulator: 'OSE', name: 'Osaka Exchange' },
  { page: '02.html', regulator: 'JPX-R', name: 'Japan Exchange Regulation' },
  { page: '03.html', regulator: 'TOCOM', name: 'Tokyo Commodity Exchange' }
];
const JPX_REVISIONS_BASE = 'https://www.jpx.co.jp/english/rules-participants/rules/revise/';

export function parseJpxRevisions(html: string, pageUrl: string): { date: string; title: string; outline?: string }[] {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];
  const rows: { date: string; title: string; outline?: string }[] = [];
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = row.match(/<td[\s\S]*?<\/td>/gi) || [];
    if (cells.length < 2) continue;
    const parsed = Date.parse(`${stripHtml(cells[0]!).replace(/\./g, '')} UTC`);
    if (isNaN(parsed)) continue;
    const outline = row.match(/href="([^"]+\.pdf)"/i)?.[1];
    rows.push({
      date: new Date(parsed).toISOString().slice(0, 10),
      title: stripHtml(htmlToText(cells[1])),
      outline: outline ? new URL(outline, pageUrl).toString() : undefined
    });
  }
  return rows;
}

async function fetchJpxRuleRevisions(limit = 4): Promise<NormalizedNotice[]> {
  const pages = await Promise.allSettled(
    JPX_REVISIONS.map(async ex => {
      const url = JPX_REVISIONS_BASE + ex.page;
      return parseJpxRevisions(await (await fetchOrThrow(url)).text(), url).map(row => ({ ...row, ex, url }));
    })
  );
  const rows = pages.flatMap(p => (p.status === 'fulfilled' ? p.value : []));
  if (rows.length === 0) throw new Error('No rule revisions could be read from JPX');
  return rows
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(row => {
      // "Enforcement Rules" is a kind of rulebook, so the title isn't used to pick the format
      const format = 'Circulars' as const;
      const sector = sectorOf(row.title);
      const score = estimateImpact(format);
      const publishedAt = zonedToIso(`${row.date}T00:00:00`, 'Asia/Tokyo');
      const slug = row.outline ? row.outline.split('/').slice(-2, -1)[0] : row.title.slice(0, 40).replace(/\W+/g, '-');
      return {
        id: `jpx-${row.ex.regulator.toLowerCase()}-${slug}`,
        ref: `${row.ex.name} rule revision ${row.date}`,
        title: row.title,
        regulator: row.ex.regulator,
        jurisdiction: 'JAPAN',
        jurisdictionCode: 'JP' as const,
        type: 'RULE REVISION',
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: publishedAt ? getRelativeTime(publishedAt) : 'Recently',
        publishedAt,
        tags: ['JPX', row.ex.regulator, format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: row.outline || row.url,
        isLiveFeed: true
      };
    });
}

// ---------------------------------------------------------------------------
// Rules for artificial intelligence, from the official source in each
// jurisdiction that makes or enforces them. General government feeds are
// narrowed to items about AI rules (src/lib/aiTopics.ts), so a read of one may
// find none.

// Plain text of a fragment of HTML, with its entities decoded
const plainText = (html: string) => stripHtml(htmlToText(html));

// "06 October 2026", "Oct 8, 2026" -> 2026-10-08
function isoDay(text: string): string | undefined {
  if (!/^(\d{1,2} [A-Z][a-z]+ \d{4}|[A-Z][a-z]+ \d{1,2}, \d{4})$/.test(text.trim())) return undefined;
  const t = Date.parse(`${text.trim()} 12:00 UTC`);
  return isNaN(t) ? undefined : new Date(t).toISOString().slice(0, 10);
}

// List pages read for `limit` items: one for the feed's usual read, more for
// a scheduled check or a backfill
const pagesFor = (limit: number, perPage: number, max: number) => Math.min(max, Math.max(1, Math.ceil(limit / perPage)));

// Rows of a paged list. The first page must load; later pages are read one at
// a time and skipped if they fail.
async function readPages<T>(urls: string[], parse: (html: string) => T[]): Promise<T[]> {
  const rows = parse(await (await fetchOrThrow(urls[0])).text());
  for (const url of urls.slice(1)) {
    try {
      rows.push(...parse(await (await fetchOrThrow(url)).text()));
    } catch (err: any) {
      console.log(`[RegSonar Feed Sentinel] Skipped ${url}: ${describeError(err)}`);
    }
  }
  return rows;
}

interface AiItem {
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

function aiNotice(item: AiItem): NormalizedNotice {
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
    tags: [item.regulator, format, sector, 'AI rules'],
    sector,
    format,
    severity: severityFor(score),
    dossierUrl: item.url,
    isLiveFeed: true,
    ...(item.language ? { language: item.language } : {})
  };
}

const newestFirst = <T extends { date: string }>(rows: T[]) => rows.sort((a, b) => b.date.localeCompare(a.date));
const uniqueBy = <T>(rows: T[], key: (row: T) => string) => {
  const seen = new Set<string>();
  return rows.filter(r => !seen.has(key(r)) && !!seen.add(key(r)));
};

// European Commission news on AI (the AI Act, its guidelines, the AI Office
// and AI Board), from the news list of the Commission's "Shaping Europe's
// digital future" site, filtered to its artificial intelligence topic. The
// site's RSS feed covers every digital topic and can't be filtered.
const EC_SITE = 'https://digital-strategy.ec.europa.eu';
const EC_AI_NEWS = `${EC_SITE}/en/news?topic=119`;

export function parseEcNews(html: string): { kind: string; date: string; url: string; title: string; teaser: string }[] {
  return html.split('<article').slice(1).flatMap(chunk => {
    const meta = [...chunk.matchAll(/class="ecl-content-block__primary-meta-item">([^<]+)</g)].map(m => m[1].trim());
    const link = chunk.match(/class="ecl-content-block__title"><a\s+href="([^"]+)"[\s\S]*?<span>([\s\S]*?)<\/span>/);
    const date = meta.map(isoDay).find(Boolean);
    if (!link || !date) return [];
    const teaser = chunk.match(/class="ecl-content-block__description">([\s\S]*)/)?.[1] ?? '';
    return [{ kind: meta[0], date, url: new URL(link[1], EC_SITE).toString(), title: plainText(link[2]), teaser: plainText(teaser) }];
  });
}

async function fetchEcAiNews(limit = 4): Promise<NormalizedNotice[]> {
  const pages = Array.from({ length: pagesFor(limit, 5, 4) }, (_, page) => (page ? `${EC_AI_NEWS}&page=${page}` : EC_AI_NEWS));
  const rows = await readPages(pages, parseEcNews);
  return newestFirst(uniqueBy(rows, r => r.url))
    .filter(r => isAiRuleNews(r.title, r.teaser))
    .slice(0, limit)
    .map(r => aiNotice({
      id: `ec-${lastPathPart(r.url)}`.slice(0, 120),
      ref: `European Commission · ${r.kind}`,
      title: r.title,
      regulator: 'European Commission',
      jurisdiction: 'EUROPEAN UNION',
      jurisdictionCode: 'UK_EU',
      type: r.kind.toUpperCase(),
      publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Europe/Brussels'),
      summary: r.teaser || undefined,
      url: r.url
    }));
}

// US federal documents on AI from any agency: executive orders, rules,
// proposals and requests for information. The Federal Register's search finds
// "artificial intelligence" anywhere in a document, often in passing, so only
// documents whose title is about AI are kept, less meeting, nomination and
// paperwork notices.
const FEDERAL_REGISTER_AI = 'https://www.federalregister.gov/api/v1/documents.json?conditions[term]=%22artificial+intelligence%22&order=newest';
const NOT_A_RULE = /\bmeetings?\b|\bnominations?\b|\bsunshine act\b|\binformation collection\b/i;
const FEDERAL_AGENCIES: Record<string, string> = {
  'Executive Office of the President': 'US President',
  'National Institute of Standards and Technology': 'NIST',
  'Federal Trade Commission': 'US FTC',
  'Industry and Security Bureau': 'US Commerce (BIS)',
  'Science and Technology Policy Office': 'US OSTP',
  'Management and Budget Office': 'US OMB',
  'Securities and Exchange Commission': 'US SEC',
  'Commodity Futures Trading Commission': 'US CFTC'
};

async function fetchFederalRegisterAi(limit = 4): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(`${FEDERAL_REGISTER_AI}&per_page=${limit <= 4 ? 100 : 300}${FEDERAL_REGISTER_FIELDS}`);
  const docs: any[] = (await res.json()).results || [];
  return docs
    .filter(doc => mentionsAi(doc.title || '') && !NOT_A_RULE.test(doc.title || ''))
    .slice(0, limit)
    .map((doc, idx) => {
      // The most specific agency: "National Institute of Standards and Technology" rather than "Commerce Department"
      const agency = doc.agencies?.at(-1);
      const name: string = agency?.name || agency?.raw_name || '';
      return federalRegisterNotice(doc, idx, FEDERAL_AGENCIES[name] || (name ? `US ${name}` : 'US Federal Register'), ['AI rules']);
    });
}

// RSS feeds of US agencies and states with AI rules. Their feeds cover all
// their work, so only items about AI rules are kept (a regulator whose every
// item is a rule matter needs only an AI mention).
interface AiFeed {
  id: string;
  url: string;
  regulator: string;
  jurisdiction: string;
  type: string;
  aiMentionOnly?: true;
}

// The FTC: inquiries, enforcement and policy statements on AI
const FTC_AI: AiFeed = { id: 'ftc', url: 'https://www.ftc.gov/feeds/press-release.xml', regulator: 'US FTC', jurisdiction: 'UNITED STATES', type: 'PRESS RELEASE' };
// California's governor signs the state's AI laws (such as SB 53 on frontier
// AI); the office's site search for "artificial intelligence", as a feed
const CALIFORNIA_GOVERNOR_AI: AiFeed = { id: 'ca-gov', url: 'https://www.gov.ca.gov/?s=artificial+intelligence&feed=rss2', regulator: 'California Governor', jurisdiction: 'UNITED STATES (CALIFORNIA)', type: 'NEWS' };
// California's privacy regulator (CalPrivacy, the CPPA), which makes the rules
// on automated decisionmaking technology (ADMT)
const CALPRIVACY_AI: AiFeed = { id: 'calprivacy', url: 'https://privacy.ca.gov/feed/', regulator: 'CalPrivacy (CPPA)', jurisdiction: 'UNITED STATES (CALIFORNIA)', type: 'NEWS', aiMentionOnly: true };
// Colorado's attorney general enforces, and makes rules under, the Colorado AI Act
const COLORADO_AG_AI: AiFeed = { id: 'co-ag', url: 'https://coag.gov/?s=artificial+intelligence&feed=rss2', regulator: 'Colorado AG', jurisdiction: 'UNITED STATES (COLORADO)', type: 'NEWS' };

async function fetchAiFeed(feed: AiFeed, limit: number): Promise<NormalizedNotice[]> {
  const items = await rssItems(feed.url);
  return items
    .map((item: any) => ({
      title: plainText(String(item.title)),
      description: item.description ? plainText(String(item.description)).replace(/\s*View Press Release$/, '').replace(/\s*The post .* appeared first on .*$/, '') : '',
      link: String(item.link),
      published: toIso(item.pubDate)
    }))
    .filter(x => (feed.aiMentionOnly ? mentionsAi(`${x.title} ${x.description}`) : isAiRuleNews(x.title, x.description)))
    .slice(0, limit)
    .map(x => aiNotice({
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
    }));
}

// South Korea's Ministry of Science and ICT administers the Framework Act on
// AI: its English press releases. The list page writes each row's title and
// date in a script, and a row opens view.do with the row's number.
const MSIT_LIST = 'https://www.msit.go.kr/eng/bbs/list.do?sCode=eng&mId=4&mPid=2';
const msitPage = (n: string) => `https://www.msit.go.kr/eng/bbs/view.do?sCode=eng&mId=4&mPid=2&bbsSeqNo=42&nttSeqNo=${n}`;

export function parseMsitPressReleases(html: string): { id: string; title: string; date: string }[] {
  const ids = [...html.matchAll(/onclick="fn_detail\((\d+)\);"/g)].map(m => m[1]);
  return ids.flatMap((id, i) => {
    const row = `'NO'+'_${i}')`;
    const start = html.indexOf(row);
    const end = html.indexOf(`'NO'+'_${i + 1}')`, start);
    if (start < 0) return [];
    const script = html.slice(start, end < 0 ? undefined : end);
    const title = script.match(/unescape\('([^']*)'\)/)?.[1];
    const day = script.match(/'REG_DT'\)\{\s*\$\('#td_'\+'NO'\+'_\d+'\)\.html\('([^']+)'\)/)?.[1];
    const date = day && isoDay(day);
    return title && date ? [{ id, title: plainText(title), date }] : [];
  });
}

async function fetchMsitPressReleases(limit = 4): Promise<NormalizedNotice[]> {
  const pages = Array.from({ length: pagesFor(limit, 10, 3) }, (_, i) => (i ? `${MSIT_LIST}&pageIndex=${i + 1}` : MSIT_LIST));
  const rows = await readPages(pages, parseMsitPressReleases);
  return newestFirst(uniqueBy(rows, r => r.id))
    .filter(r => isAiRuleNews(r.title))
    .slice(0, limit)
    .map(r => aiNotice({
      id: `msit-${r.id}`,
      ref: `MSIT Press Release ${r.date}`,
      title: r.title,
      regulator: 'MSIT',
      jurisdiction: 'SOUTH KOREA',
      jurisdictionCode: 'KR',
      type: 'PRESS RELEASE',
      publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Asia/Seoul'),
      url: msitPage(r.id)
    }));
}

// China's AI rules are made by the Cyberspace Administration (CAC) and other
// State Council departments. The CAC's own site doesn't accept connections
// from the hosting region, so they come from the State Council's policy
// library on gov.cn, through the search service its page uses: State Council
// documents, departments' documents, and the State Council Gazette, which
// prints department rules (orders) some weeks after they are issued. Titles
// stay in Chinese.
const GOV_CN_POLICY_SEARCH = (n: number) => `https://sousuo.www.gov.cn/search-gov/data?${new URLSearchParams({
  t: 'zhengcelibrary', q: '人工智能', searchfield: 'title', sort: 'pubtime', sortType: '1', type: 'gwyzcwjk', p: '1', n: String(n)
})}`;
// The library's other list (news and explainers) is left out
const GOV_CN_LISTS: Record<string, string> = {
  gongwen: 'STATE COUNCIL DOCUMENT',
  bumenfile: 'DEPARTMENT DOCUMENT',
  gongbao: 'STATE COUNCIL GAZETTE'
};
// Lead issuers, by the names the library uses
const GOV_CN_ISSUERS: [RegExp, string][] = [
  [/网信|互联网信息办公室/, 'CAC'],
  [/工业和信息化部/, 'MIIT'],
  [/发展和?改革委/, 'NDRC'],
  [/^科学?技术?部$/, 'MOST'],
  [/^教育部$/, 'MOE'],
  [/^公安部$/, 'MPS'],
  [/市场监(督)?管(理)?总局/, 'SAMR'],
  [/^国家数据局$/, 'NDA'],
  [/卫生健康委/, 'NHC'],
  [/药监局|药品监督管理局/, 'NMPA'],
  [/知识产权局/, 'CNIPA'],
  [/气象局/, 'CMA'],
  [/广电总局|广播电视总局/, 'NRTA'],
  [/标准化管理委员会|标准委/, 'SAC'],
  [/人力资源社会保障部/, 'MOHRSS'],
  [/^商务部$/, 'MOFCOM'],
  [/民航局|民用航空局/, 'CAAC'],
  [/^国务院$/, 'State Council']
];
// "...总局令（第21号）\n人工智能拟人化互动服务管理暂行办法": an order and the rules it makes
const GOV_CN_ORDER = /^(.+?)令（第(\d+)号）\n(.+)$/;
const GOV_CN_SPEECH = /讲话|致辞|致信|贺信/;

// Search hits mark the query in <em>. Gazette titles wrap with <br/> and one
// ideographic space, and start a new line (the rules an order makes, or the
// plan a notice issues) with two.
const govCnTitle = (title: string) => title
  .replace(/<br\s*\/?>　　/g, '\n')
  .replace(/<br\s*\/?>[ 　]*/g, '')
  .replace(/<[^>]*>?/g, '')
  .replace(/…{2,}[\s\S]*$/, '')
  .trim();

function govCnIssuer(issuers: string): string {
  const lead = issuers.split(/[\s 　]+/)[0].replace(/^中华人民共和国/, '').replace(/等$/, '').replace(/办公厅$/, '');
  return GOV_CN_ISSUERS.find(([pattern]) => pattern.test(lead))?.[1] ?? lead;
}

export function parseGovCnPolicies(json: any): { id: string; title: string; url: string; published: string; type: string; regulator: string; order?: string }[] {
  const catMap = json?.searchVO?.catMap ?? {};
  const rows = Object.entries(GOV_CN_LISTS).flatMap(([list, type]) =>
    ((catMap[list]?.listVO ?? []) as any[]).flatMap(item => {
      const lines = govCnTitle(String(item.title ?? ''));
      const order = lines.match(GOV_CN_ORDER);
      const title = order ? order[3] : lines.split('\n')[0];
      const url = String(item.url ?? '');
      if (!title || !url || !Number.isFinite(item.pubtime) || GOV_CN_SPEECH.test(title)) return [];
      // Issuers: the order's, the list's, or those before "关于" (concerning) in the title
      const issuers = order ? order[1] : String(item.puborg || (list === 'gongwen' ? '国务院' : title.split('关于')[0]));
      return [{
        id: `govcn-${lastPathPart(url)}`,
        title,
        url,
        published: new Date(item.pubtime).toISOString(),
        type: order ? 'DEPARTMENT RULES' : type,
        regulator: govCnIssuer(issuers) || 'State Council Gazette',
        order: order?.[2]
      }];
    })
  );
  // The Gazette reprints documents from the other lists, sometimes with the
  // issuers before the title: keep the first publication
  const key = (title: string) => title.replace(/\s/g, '');
  const kept: typeof rows = [];
  for (const row of rows.sort((a, b) => a.published.localeCompare(b.published))) {
    if (!kept.some(k => key(row.title).endsWith(key(k.title)) || key(k.title).endsWith(key(row.title)))) kept.push(row);
  }
  return kept.reverse();
}

async function fetchGovCnAiPolicies(limit = 4): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(GOV_CN_POLICY_SEARCH(50));
  return parseGovCnPolicies(await res.json())
    .filter(r => isAiRuleNews(r.title))
    .slice(0, limit)
    .map(r => aiNotice({
      id: r.id,
      ref: r.order ? `${r.regulator} Order No. ${r.order}` : `${r.regulator} ${r.published.slice(0, 10)}`,
      title: r.title,
      regulator: r.regulator,
      jurisdiction: 'CHINA',
      jurisdictionCode: 'CN',
      type: r.type,
      publishedAt: r.published,
      url: r.url,
      language: 'zh'
    }));
}

// The UK has no AI act; its regulators apply their existing rules (the PRA's
// and FCA's are read already). AI policy comes from the Department for
// Science, Innovation and Technology and the AI Security Institute, from
// GOV.UK's search API.
const GOV_UK_AI = 'https://www.gov.uk/api/search.json?filter_organisations=department-for-science-innovation-and-technology&filter_organisations=ai-security-institute' +
  '&filter_content_purpose_supergroup=news_and_communications&filter_content_purpose_supergroup=guidance_and_regulation&filter_content_purpose_supergroup=policy_and_engagement' +
  '&order=-public_timestamp&fields=title&fields=description&fields=link&fields=public_timestamp&fields=format&fields=primary_publishing_organisation';

async function fetchUkAiPolicy(limit = 4): Promise<NormalizedNotice[]> {
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

// Japan's AI policy under the AI Promotion Act: the topics list of the Cabinet
// Office's AI strategy pages (the secretariat of the AI Strategy Headquarters),
// in Japanese. Every topic is about AI.
const CAO_AI_TOPICS = 'https://www8.cao.go.jp/cstp/ai/ai_topics/ai_topics.html';

export function parseCaoAiTopics(html: string, pageUrl: string): { date: string; url: string; title: string }[] {
  return [...html.matchAll(/<dt>(\d{4})年(\d{1,2})月(\d{1,2})日<\/dt>\s*<dd><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({
    date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`,
    url: new URL(m[4], pageUrl).toString(),
    title: plainText(m[5])
  }));
}

async function fetchCaoAiTopics(limit = 4): Promise<NormalizedNotice[]> {
  const rows = parseCaoAiTopics(await (await fetchOrThrow(CAO_AI_TOPICS)).text(), CAO_AI_TOPICS);
  return newestFirst(rows).slice(0, limit).map(r => aiNotice({
    id: `cao-ai-${r.date}-${createHash('sha1').update(r.title).digest('hex').slice(0, 8)}`,
    ref: `Cabinet Office AI Strategy ${r.date}`,
    title: r.title,
    regulator: 'Cabinet Office',
    jurisdiction: 'JAPAN',
    jurisdictionCode: 'JP',
    type: 'AI STRATEGY',
    publishedAt: zonedToIso(`${r.date}T00:00:00`, 'Asia/Tokyo'),
    url: r.url,
    language: 'ja'
  }));
}

type EndpointStatus = 'Operational' | 'Degraded' | 'Down';

interface EndpointDefinition {
  id: string;
  name: string;
  agency: string;
  jurisdiction: string;
  url: string;
  protocol: string;
  auth: string;
  ingests: boolean;
}

const ENDPOINTS: EndpointDefinition[] = [
  {
    id: 'fed-reg',
    name: 'US Federal Register API',
    agency: 'SEC & CFTC',
    jurisdiction: 'US Federal',
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=securities-and-exchange-commission&order=newest&per_page=1',
    protocol: 'REST JSON',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'hkma-rss',
    name: 'HKMA RSS Feeds',
    agency: 'HKMA (Hong Kong)',
    jurisdiction: 'Hong Kong',
    url: 'https://www.hkma.gov.hk/eng/other-information/rss/rss_press-release.xml',
    protocol: 'RSS XML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'hkma-dms',
    name: 'HKMA Daily Monetary Statistics',
    agency: 'HKMA liquidity data (Hong Kong)',
    jurisdiction: 'Hong Kong',
    url: HKMA_DAILY_STATS_PAGE,
    protocol: 'HTML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'fca-rss',
    name: 'UK FCA News RSS',
    agency: 'FCA (United Kingdom)',
    jurisdiction: 'United Kingdom',
    url: 'https://www.fca.org.uk/news/rss.xml',
    protocol: 'RSS XML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'boe-pra',
    name: 'Bank of England PRA Publications RSS',
    agency: 'PRA (United Kingdom)',
    jurisdiction: 'United Kingdom',
    url: 'https://www.bankofengland.co.uk/rss/prudential-regulation-publications',
    protocol: 'RSS XML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'mas-gov',
    name: 'Singapore MAS News Search API',
    agency: 'MAS (Singapore)',
    jurisdiction: 'Singapore',
    url: 'https://www.mas.gov.sg/api/v1/search?q=*:*&rows=1&wt=json',
    protocol: 'JSON (undocumented)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'sfc-rss',
    name: 'SFC RSS Feeds',
    agency: 'SFC (Hong Kong)',
    jurisdiction: 'Hong Kong',
    url: `${SFC_RSS}/Press-releases`,
    protocol: 'RSS XML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'hkex-rss',
    name: 'HKEX Regulatory Announcements RSS',
    agency: 'HKEX (Hong Kong)',
    jurisdiction: 'Hong Kong',
    url: HKEX_REGULATORY_RSS,
    protocol: 'RSS XML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'esma-rss',
    name: 'ESMA News RSS',
    agency: 'ESMA (European Union)',
    jurisdiction: 'European Union',
    url: ESMA_RSS,
    protocol: 'RSS XML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'ec-ai',
    name: 'European Commission AI News',
    agency: 'European Commission (European Union)',
    jurisdiction: 'European Union',
    url: EC_AI_NEWS,
    protocol: 'HTML (news list, AI topic)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'govuk-ai',
    name: 'GOV.UK Search API: DSIT & AI Security Institute',
    agency: 'DSIT & AI Security Institute (UK)',
    jurisdiction: 'United Kingdom',
    url: `${GOV_UK_AI}&count=1`,
    protocol: 'REST JSON (items on AI rules only)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'fedreg-ai',
    name: 'Federal Register API: AI documents',
    agency: 'US federal agencies',
    jurisdiction: 'US Federal',
    url: `${FEDERAL_REGISTER_AI}&per_page=1`,
    protocol: 'REST JSON (titles about AI only)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'ftc-rss',
    name: 'FTC Press Releases RSS',
    agency: 'FTC (United States)',
    jurisdiction: 'US Federal',
    url: FTC_AI.url,
    protocol: 'RSS XML (items on AI rules only)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'ca-gov',
    name: 'California Governor: site search feed',
    agency: 'Governor of California',
    jurisdiction: 'US · California',
    url: CALIFORNIA_GOVERNOR_AI.url,
    protocol: 'RSS XML (search for AI; items on AI rules only)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'calprivacy',
    name: 'CalPrivacy News RSS',
    agency: 'California Privacy Protection Agency',
    jurisdiction: 'US · California',
    url: CALPRIVACY_AI.url,
    protocol: 'RSS XML (items mentioning AI only)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'co-ag',
    name: 'Colorado AG: site search feed',
    agency: 'Colorado Attorney General',
    jurisdiction: 'US · Colorado',
    url: COLORADO_AG_AI.url,
    protocol: 'RSS XML (search for AI; items on AI rules only)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'msit-kr',
    name: 'MSIT English Press Releases',
    agency: 'Ministry of Science and ICT (South Korea)',
    jurisdiction: 'South Korea',
    url: MSIT_LIST,
    protocol: 'HTML (list data in page; items on AI rules only)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'govcn-ai',
    name: 'gov.cn Policy Library: AI',
    agency: 'State Council & its departments (China)',
    jurisdiction: 'China',
    url: GOV_CN_POLICY_SEARCH(1),
    protocol: 'JSON (policy library search, in Chinese; items on AI rules only)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'cao-ai',
    name: 'Cabinet Office AI Strategy Topics',
    agency: 'Cabinet Office (Japan)',
    jurisdiction: 'Japan',
    url: CAO_AI_TOPICS,
    protocol: 'HTML (topics list, in Japanese)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'fsb-rss',
    name: 'FSB Publications RSS',
    agency: 'FSB (Global)',
    jurisdiction: 'Global',
    url: FSB_RSS,
    protocol: 'RSS XML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'asic-gov',
    name: 'ASIC Media Releases',
    agency: 'ASIC (Australia)',
    jurisdiction: 'Australia',
    url: ASIC_MEDIA_RELEASES,
    protocol: 'JSON (behind ASIC newsroom page)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'jfsa-rss',
    name: 'JFSA English News RSS',
    agency: 'JFSA (Japan)',
    jurisdiction: 'Japan',
    url: JFSA_RSS,
    protocol: 'RSS XML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'sgx-regco',
    name: 'SGX RegCo Content API',
    agency: 'SGX RegCo (Singapore)',
    jurisdiction: 'Singapore',
    url: `${SGX_CONTENT_API}?queryId=${SGX_QUERY_ID}%3Apublic_consultations_list&variables=%7B%22limit%22%3A1%2C%22offset%22%3A0%2C%22lang%22%3A%22EN%22%7D`,
    protocol: 'JSON (behind SGX RegCo pages)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'asx-consult',
    name: 'ASX Public Consultations',
    agency: 'ASX (Australia)',
    jurisdiction: 'Australia',
    url: ASX_CONSULTATIONS_PAGE,
    protocol: 'HTML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'jpx-rules',
    name: 'JPX Rule Revisions',
    agency: 'TSE, OSE, TOCOM, JPX-R (Japan)',
    jurisdiction: 'Japan',
    url: JPX_REVISIONS_BASE + 'index.html',
    protocol: 'HTML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'bnm-rss',
    name: 'BNM Press Releases',
    agency: 'BNM (Malaysia)',
    jurisdiction: 'Malaysia',
    url: bnmYearPage(new Date().getUTCFullYear()),
    protocol: 'HTML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'sc-my',
    name: 'SC Malaysia Media Releases',
    agency: 'SC Malaysia',
    jurisdiction: 'Malaysia',
    url: SC_MEDIA_RELEASES,
    protocol: 'HTML (list data in page)',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'finra-rss',
    name: 'FINRA Notices RSS',
    agency: 'FINRA (United States)',
    jurisdiction: 'US',
    url: FINRA_NOTICES_RSS,
    protocol: 'RSS XML',
    auth: 'Public / None',
    ingests: true
  },
  {
    id: 'bis-portal',
    name: 'BIS Media Releases RSS',
    agency: 'BIS & Basel Committee',
    jurisdiction: 'Global',
    url: 'https://www.bis.org/doclist/all_pressrels.rss',
    protocol: 'RSS 1.0 (RDF)',
    auth: 'Public / None',
    ingests: true
  }
];

// Pages that return HTTP 200 but carry no usable content
const UNUSABLE_PAGE_TITLE = /maintenance|just a moment|attention required|access denied|service unavailable/i;
const FIREWALL_BLOCK_BODY = /your request has been blocked/i;

// Probe one endpoint and report what actually happened. Never invents a status.
async function probeEndpoint(ep: EndpointDefinition) {
  const start = Date.now();
  try {
    const res = await politeFetch(ep.url);
    const body = await res.text();
    const pingMs = Date.now() - start;
    const pageTitle = body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();

    let status: EndpointStatus;
    let detail: string;
    if (res.status >= 500) {
      status = 'Down';
      detail = `HTTP ${res.status}`;
    } else if (!res.ok) {
      status = 'Degraded';
      if (FIREWALL_BLOCK_BODY.test(body)) {
        detail = `HTTP ${res.status}: blocked by site firewall (likely rate limiting)`;
      } else if (pageTitle && UNUSABLE_PAGE_TITLE.test(pageTitle)) {
        detail = `HTTP ${res.status}: blocked ("${pageTitle}")`;
      } else {
        detail = `HTTP ${res.status}`;
      }
    } else if (pageTitle && UNUSABLE_PAGE_TITLE.test(pageTitle)) {
      status = 'Degraded';
      detail = `HTTP ${res.status} but page says "${pageTitle}"`;
    } else {
      status = 'Operational';
      detail = `HTTP ${res.status}`;
    }

    return { ...ep, status, statusCode: res.status, pingMs, detail };
  } catch (err: any) {
    if (err instanceof RateLimitedError) {
      return { ...ep, status: 'Degraded' as EndpointStatus, statusCode: 429, pingMs: null, detail: err.message };
    }
    const detail = err?.name === 'TimeoutError'
      ? `Timed out after ${FETCH_TIMEOUT_MS / 1000}s`
      : err?.cause?.code || err?.message || 'Request failed';
    return { ...ep, status: 'Down' as EndpointStatus, statusCode: null, pingMs: null, detail };
  }
}

// Government APIs (HKMA in particular) rate-limit aggressively, so probes and
// source fetches are cached rather than repeated on every client poll.
const HEALTH_TTL_MS = 5 * 60 * 1000;
const SOURCE_TTL_MS = 10 * 60 * 1000;
// The liquidity figures change once a business day (about 7pm Hong Kong time)
const HKMA_SOURCE_TTL_MS = 30 * 60 * 1000;

let healthCache: { at: number; results: Promise<Awaited<ReturnType<typeof probeEndpoint>>[]> } | null = null;

function getEndpointsHealth() {
  if (!healthCache || Date.now() - healthCache.at > HEALTH_TTL_MS) {
    healthCache = { at: Date.now(), results: Promise.all(ENDPOINTS.map(probeEndpoint)) };
  }
  return healthCache.results;
}

// Daily liquidity figures for the chart, one page per business day. HKMA
// publishes each date at .../daily-monetary-statistics/YYYY/MM/ms-YYYYMMDD/.
// Past dates never change, so each is fetched once per server process; the
// latest figures come from the liquidity source.
// Calendar days of history for each range the chart offers
export const LIQUIDITY_RANGES = { '1m': 28, '3m': 91 } as const;
export type LiquidityRange = keyof typeof LIQUIDITY_RANGES;
const liquidityDayCache = new Map<string, LiquidityDay | null>();
const liquidityHistoryInFlight = new Map<LiquidityRange, Promise<{ days: LiquidityDay[]; failed: number }>>();

function hongKongDate(offsetDays = 0): string {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(d);
}

function liquidityDayUrl(date: string): string {
  const [y, m, d] = date.split('-');
  return `${HKMA_DAILY_STATS_PAGE}${y}/${m}/ms-${y}${m}${d}/`;
}

async function fetchLiquidityDay(date: string): Promise<LiquidityDay | null> {
  if (liquidityDayCache.has(date)) return liquidityDayCache.get(date)!;
  const html = await (await fetchOrThrow(liquidityDayUrl(date))).text();
  const parsed = parseHkmaDailyStats(html);
  // A page for another date than the one asked for is treated as no figures
  const day = parsed?.date === date ? parsed : null;
  liquidityDayCache.set(date, day);
  return day;
}

async function loadLiquidityHistory(range: LiquidityRange): Promise<{ days: LiquidityDay[]; failed: number }> {
  // Weekdays before today (Hong Kong); today's figures appear after 7pm
  const dates: string[] = [];
  for (let i = 1; i <= LIQUIDITY_RANGES[range]; i++) {
    const date = hongKongDate(i);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) dates.push(date);
  }

  // Two requests at a time to stay polite to the HKMA site
  const days: LiquidityDay[] = [];
  let failed = 0;
  for (let i = 0; i < dates.length; i += 2) {
    const results = await Promise.allSettled(dates.slice(i, i + 2).map(fetchLiquidityDay));
    for (const r of results) {
      if (r.status === 'rejected') failed++;
      else if (r.value) days.push(r.value);
    }
  }
  return { days, failed };
}

async function getLiquidityHistory(range: LiquidityRange) {
  let inFlight = liquidityHistoryInFlight.get(range);
  if (!inFlight) {
    inFlight = loadLiquidityHistory(range).finally(() => liquidityHistoryInFlight.delete(range));
    liquidityHistoryInFlight.set(range, inFlight);
  }
  const [{ days, failed }, latestState] = await Promise.all([
    inFlight,
    refreshSource(SOURCES.find(src => src.name === 'HKMA Interbank Liquidity')!)
  ]);

  // Today's figures (from the liquidity source) are added if not already present
  const byDate = new Map(days.map(d => [d.date, d]));
  if (latestLiquidity && !byDate.has(latestLiquidity.date)) byDate.set(latestLiquidity.date, latestLiquidity);
  return {
    days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
    range,
    failed,
    latestError: latestState.error,
    source: HKMA_DAILY_STATS_PAGE
  };
}

// Ingestion sources, keyed to the endpoint they read from
// fetch(limit) reads more than the feed's usual number of items; the email digest uses this
// narrowed: keeps only the feed's items about AI rules, so a read may find none
type SourceDefinition = { endpointId: string; name: string; fetch: (limit?: number) => Promise<NormalizedNotice[]>; ttlMs?: number; inDigest?: false; narrowed?: true };

const SOURCE_LIST: SourceDefinition[] = [
  { endpointId: 'fed-reg', name: 'US Federal Register', fetch: fetchFederalRegister },
  { endpointId: 'fca-rss', name: 'UK FCA News RSS', fetch: fetchFcaFeed },
  { endpointId: 'boe-pra', name: 'UK PRA Publications', fetch: fetchPraPublications },
  { endpointId: 'hkma-rss', name: 'HKMA Press Releases', fetch: fetchHkmaPressReleases },
  { endpointId: 'hkma-rss', name: 'HKMA Circulars', fetch: fetchHkmaCirculars },
  { endpointId: 'hkma-rss', name: 'HKMA Consultations', fetch: fetchHkmaConsultations },
  { endpointId: 'hkma-dms', name: 'HKMA Interbank Liquidity', fetch: fetchHkmaLiquidity, ttlMs: HKMA_SOURCE_TTL_MS, inDigest: false },
  { endpointId: 'sfc-rss', name: 'SFC Press Releases', fetch: fetchSfcPressReleases },
  { endpointId: 'sfc-rss', name: 'SFC Circulars', fetch: fetchSfcCirculars },
  { endpointId: 'sfc-rss', name: 'SFC Consultations', fetch: fetchSfcConsultations },
  { endpointId: 'hkex-rss', name: 'HKEX Regulatory Announcements', fetch: fetchHkexRegulatory },
  { endpointId: 'mas-gov', name: 'MAS Media Releases', fetch: fetchMasMediaReleases },
  { endpointId: 'mas-gov', name: 'MAS Consultations', fetch: fetchMasConsultations },
  { endpointId: 'mas-gov', name: 'MAS Circulars & Guidelines', fetch: fetchMasRegulatoryPublications },
  { endpointId: 'asic-gov', name: 'ASIC Media Releases', fetch: fetchAsicMediaReleases },
  { endpointId: 'jfsa-rss', name: 'JFSA News', fetch: fetchJfsaNews },
  { endpointId: 'esma-rss', name: 'ESMA News', fetch: fetchEsmaNews },
  { endpointId: 'fsb-rss', name: 'FSB Publications', fetch: fetchFsbPublications },
  { endpointId: 'sgx-regco', name: 'SGX RegCo Consultations', fetch: fetchSgxConsultations },
  { endpointId: 'sgx-regco', name: 'SGX RegCo Disciplinary Actions', fetch: fetchSgxDisciplinaryActions },
  { endpointId: 'sgx-regco', name: 'SGX RegCo Announcements', fetch: fetchSgxRegulatoryNews },
  { endpointId: 'asx-consult', name: 'ASX Public Consultations', fetch: fetchAsxConsultations },
  { endpointId: 'jpx-rules', name: 'JPX Rule Revisions', fetch: fetchJpxRuleRevisions },
  { endpointId: 'finra-rss', name: 'FINRA Notices', fetch: fetchFinraNotices },
  { endpointId: 'bnm-rss', name: 'BNM Press Releases', fetch: fetchBnmPressReleases },
  { endpointId: 'sc-my', name: 'SC Malaysia Media Releases', fetch: fetchScMediaReleases },
  { endpointId: 'bis-portal', name: 'BIS Media Releases', fetch: fetchBisPressReleases },
  // Rules for artificial intelligence
  { endpointId: 'ec-ai', name: 'European Commission AI News', fetch: fetchEcAiNews, narrowed: true },
  { endpointId: 'govuk-ai', name: 'UK DSIT & AI Security Institute', fetch: fetchUkAiPolicy, narrowed: true },
  { endpointId: 'fedreg-ai', name: 'US Federal Register: AI', fetch: fetchFederalRegisterAi, narrowed: true },
  { endpointId: 'ftc-rss', name: 'FTC on AI', fetch: (limit = 4) => fetchAiFeed(FTC_AI, limit), narrowed: true },
  { endpointId: 'ca-gov', name: 'California Governor on AI', fetch: (limit = 4) => fetchAiFeed(CALIFORNIA_GOVERNOR_AI, limit), narrowed: true },
  { endpointId: 'calprivacy', name: 'CalPrivacy on AI', fetch: (limit = 4) => fetchAiFeed(CALPRIVACY_AI, limit), narrowed: true },
  { endpointId: 'co-ag', name: 'Colorado AG on AI', fetch: (limit = 4) => fetchAiFeed(COLORADO_AG_AI, limit), narrowed: true },
  { endpointId: 'msit-kr', name: 'Korea MSIT on AI', fetch: fetchMsitPressReleases, narrowed: true },
  { endpointId: 'govcn-ai', name: 'China State Council Policy Library: AI', fetch: fetchGovCnAiPolicies, narrowed: true },
  { endpointId: 'cao-ai', name: 'Japan Cabinet Office AI Strategy', fetch: fetchCaoAiTopics }
];

// Every source's notices get their sectors (with reasons) the same way
export const SOURCES: SourceDefinition[] = SOURCE_LIST.map(source => ({
  ...source,
  fetch: (limit?: number) => source.fetch(limit).then(notices => notices.map(tagNotice))
}));

// Key points per notice id. Documents don't change once published, so each is
// fetched and summarised once per server process. A failed fetch is not
// cached, so it is retried the next time its source refreshes.
const keyPointsCache = new Map<string, KeyPoints | null>();

// HKMA circulars and consultations link to BRDR landing pages that only hold
// metadata; the document itself is the first PDF linked from the page
const BRDR_PAGE = /^https:\/\/brdr\.hkma\.gov\.hk\//;
const BRDR_PDF_LINK = /href="(\/eng\/doc-ldg\/docId\/getPdf\/[^"]+\.pdf)"/i;
const MAX_PDF_BYTES = 15 * 1024 * 1024;

async function fetchBrdrPdfText(pageUrl: string): Promise<{ text: string; ocr: boolean; pdfUrl: string }> {
  const page = await (await fetchOrThrow(pageUrl)).text();
  const href = page.match(BRDR_PDF_LINK)?.[1];
  if (!href) throw new Error('No PDF link on BRDR page');
  const pdfUrl = new URL(href, pageUrl).toString();
  const data = new Uint8Array(await (await fetchOrThrow(pdfUrl)).arrayBuffer());
  if (data.byteLength > MAX_PDF_BYTES) throw new Error(`PDF too large (${data.byteLength} bytes)`);
  return { ...(await extractPdfText(data)), pdfUrl };
}

// SFC document pages are an empty shell filled in from a JSON API on the same
// site; the document's HTML is read from that API instead
const SFC_DOC_PAGE = /^https:\/\/apps\.sfc\.hk\/edistributionWeb\/gateway\/EN\/(news-and-announcements\/news|circular)\/doc\?refNo=([\w-]+)/;

async function fetchSfcDocText(pageUrl: string): Promise<string | null> {
  const match = pageUrl.match(SFC_DOC_PAGE);
  if (!match) return null;
  const kind = match[1] === 'circular' ? 'circular' : 'news';
  const res = await fetchOrThrow(`https://apps.sfc.hk/edistributionWeb/api/${kind}/content?refNo=${match[2]}&lang=EN`);
  const doc = await res.json();
  return typeof doc?.html === 'string' ? htmlToText(doc.html) : '';
}

async function keyPointsFor(notice: NormalizedNotice): Promise<KeyPoints | null> {
  if (keyPointsCache.has(notice.id)) return keyPointsCache.get(notice.id)!;
  try {
    let text: string;
    let ocr = false;
    let sourceUrl = notice.dossierUrl!;
    const docText = (await fetchSfcDocText(sourceUrl)) ?? (await fetchSgxDocText(sourceUrl));
    if (docText !== null) {
      text = docText;
    } else if (BRDR_PAGE.test(sourceUrl)) {
      ({ text, ocr, pdfUrl: sourceUrl } = await fetchBrdrPdfText(sourceUrl));
    } else if (/\.pdf$/i.test(new URL(sourceUrl).pathname)) {
      const data = new Uint8Array(await (await fetchOrThrow(sourceUrl)).arrayBuffer());
      if (data.byteLength > MAX_PDF_BYTES) throw new Error(`PDF too large (${data.byteLength} bytes)`);
      ({ text, ocr } = await extractPdfText(data));
    } else {
      const res = await fetchOrThrow(sourceUrl);
      text = extractArticleText(await res.text(), sourceUrl);
    }
    const result = text.length > 200 ? { ...summarize(text, { sourceUrl }), ...(ocr ? { ocr } : {}) } : null;
    keyPointsCache.set(notice.id, result);
    return result;
  } catch (err: any) {
    console.log(`[RegSonar Summaries] Could not fetch ${notice.dossierUrl}: ${describeError(err)}`);
    return null;
  }
}

// A notice with its key points, and the date they give
function withKeyPoints(notice: NormalizedNotice, keyPoints: KeyPoints): NormalizedNotice {
  return tagNotice(withKeyPointsUntagged(notice, keyPoints));
}

const NO_DATE = 'No date published';
const DATE_LABELS: Record<DateKind, string> = { closes: 'Comments close', takesEffect: 'Takes effect', complyBy: 'Comply by' };
// Round-ups quote the dates of the papers they list
const ROUND_UP = /\b(?:digest|newsletter|bulletin|round-?up)\b/i;

// The date a notice shows, chosen from the dates its document states for itself:
// - when comments close, if the document asks for comments or the notice is a
//   consultation (a digest or event notice may give another paper's closing date)
// - else the soonest date it takes effect or must be complied with, except on
//   consultations (where those dates are only proposed) and enforcement actions
// - else a closing date that has passed, as "Comments closed"
// A round-up's dates belong to the papers it lists, so it shows none.
export function noticeDate(notice: { type: string; title: string }, dates: DocumentDate[], today = hongKongDate()): Partial<NormalizedNotice> | undefined {
  if (ROUND_UP.test(notice.title)) return undefined;
  const format = formatOf(notice.type, notice.title);
  const closes = dates.find(d => d.kind === 'closes' && (!d.general || format === 'Consultations'));
  const next = closes && closes.date >= today ? closes
    : format === 'Consultations' || format === 'Enforcement' ? undefined
    : dates.filter(d => d.kind !== 'closes' && d.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next) {
    const text = `${DATE_LABELS[next.kind]}: ${next.date}`;
    return { deadlineDate: next.date, statutoryDeadline: text, deadlineQuote: next.text, statusBadge: { text, type: next.kind === 'takesEffect' ? 'action' : 'deadline' } };
  }
  if (closes) {
    const text = `Comments closed: ${closes.date}`;
    return { statutoryDeadline: text, deadlineQuote: closes.text, statusBadge: { text, type: 'standard' } };
  }
  return undefined;
}

// Sentences of the key points that can state a date: those found by the
// current rules and, in copies stored before them, the closing and dated sentences
const dateSentences = (keyPoints: KeyPoints): string[] => [
  ...(keyPoints.dates || []).map(d => d.text),
  ...(keyPoints.closingDate ? [keyPoints.closingDate.text] : []),
  ...keyPoints.facts.map(f => f.text)
];

function withKeyPointsUntagged(notice: NormalizedNotice, keyPoints: KeyPoints): NormalizedNotice {
  // Worked out again from the sentences each time, so a rule change reaches stored copies
  const dates = documentDates(dateSentences(keyPoints));
  const { closingDate: _legacy, dates: _previous, ...rest } = keyPoints;
  // Dates the source itself gives (Federal Register, MAS and SGX consultations) are kept
  const own = !notice.deadlineDate && (!notice.statutoryDeadline || notice.statutoryDeadline === NO_DATE);
  return {
    ...notice,
    keyPoints: { ...rest, ...(dates.length ? { dates } : {}) },
    ...(own ? noticeDate(notice, dates) : {})
  };
}

// Key points already in the history, so documents are read once rather than
// again by every new server instance
async function storedKeyPoints(notices: NormalizedNotice[]): Promise<Map<string, KeyPoints>> {
  try {
    const db = await getDb();
    if (!db) return new Map();
    const stored = await storedNotices(db, notices.map(n => n.id));
    return new Map([...stored].filter(([, n]) => n.keyPoints).map(([id, n]) => [id, n.keyPoints as KeyPoints]));
  } catch (err: any) {
    console.log(`[RegSonar History] Could not read stored key points: ${err?.message}`);
    return new Map();
  }
}

// Attach key points to notices that link to a document page. Fetches run one
// at a time per source to stay polite to regulator sites. A scheduled check
// limits how many documents it reads (and until when); later checks do the rest.
async function enrichWithKeyPoints(
  notices: NormalizedNotice[],
  budget: { maxFetches: number; until: number } = { maxFetches: Infinity, until: Infinity }
): Promise<NormalizedNotice[]> {
  const stored = await storedKeyPoints(notices);
  const enriched: NormalizedNotice[] = [];
  let fetches = 0;
  for (const notice of notices) {
    if (notice.keyPoints || !notice.dossierUrl || notice.id.startsWith('hkma-liquidity')) {
      enriched.push(notice);
      continue;
    }
    let keyPoints = stored.get(notice.id) ?? null;
    if (!keyPoints && (keyPointsCache.has(notice.id) || (fetches < budget.maxFetches && Date.now() < budget.until))) {
      if (!keyPointsCache.has(notice.id)) fetches++;
      keyPoints = await keyPointsFor(notice);
    }
    enriched.push(keyPoints ? withKeyPoints(notice, keyPoints) : notice);
  }
  return enriched;
}

interface SourceState {
  notices: NormalizedNotice[];
  lastSuccessAt: string | null;
  lastAttemptAt: number;
  error?: string;
  inFlight?: Promise<void>;
}

const sourceState = new Map<string, SourceState>();

// Store notices in the history database, if there is one. Failures are logged
// and never affect the live feed.
async function archiveNotices(notices: NormalizedNotice[]) {
  const toSave = notices.filter(n => !n.id.startsWith('hkma-liquidity'));
  if (toSave.length === 0) return;
  try {
    const db = await getDb();
    if (db) await saveNotices(db, toSave.map(({ archived, related, ...n }) => n));
  } catch (err: any) {
    console.log(`[RegSonar History] Could not save notices: ${err?.message}`);
  }
}

function describeError(err: any): string {
  if (err?.name === 'TimeoutError') return `Timed out after ${FETCH_TIMEOUT_MS / 1000}s`;
  return err?.message || 'Fetch failed';
}

// Refresh a source if its cache has expired. On failure the last good notices
// are kept and the error is reported alongside them.
async function refreshSource(source: (typeof SOURCES)[number]): Promise<SourceState> {
  let state = sourceState.get(source.name);
  if (!state) {
    state = { notices: [], lastSuccessAt: null, lastAttemptAt: 0 };
    sourceState.set(source.name, state);
  }
  if (state.inFlight) {
    await state.inFlight;
  } else if (Date.now() - state.lastAttemptAt > (source.ttlMs ?? SOURCE_TTL_MS)) {
    const s = state;
    s.lastAttemptAt = Date.now();
    s.inFlight = source.fetch()
      .then(enrichWithKeyPoints)
      .then(async (notices) => {
        s.notices = notices;
        s.lastSuccessAt = new Date().toISOString();
        s.error = undefined;
        await archiveNotices(notices);
      })
      .catch((err) => {
        s.error = describeError(err);
        console.log(`[RegSonar Feed Sentinel] ${source.name} failed: ${s.error}`);
      })
      .finally(() => {
        s.inFlight = undefined;
      });
    await s.inFlight;
  }
  return state;
}

// A scheduled check reads this many items from each source's list, so a
// source that publishes more between checks than the feed shows is still
// covered. When none of them is in the history yet (a new source, or a gap
// longer than the list), it reads further back.
const POLL_LIMIT = 20;
const BACKFILL_LIMIT = 50;

// Documents read for key points per source on each check, and for how long a
// check starts new reads (the function may run for 120s); later checks do the rest
const POLL_KEY_POINT_FETCHES = 5;
const POLL_FETCH_WINDOW_MS = 60_000;

interface PollResult {
  name: string;
  read: number;
  added: number;
  backfilled: boolean;
  withoutKeyPoints: number;
  notices: NormalizedNotice[];
}

async function pollSource(source: (typeof SOURCES)[number], until: number): Promise<PollResult> {
  const db = await getDb();
  let notices = await source.fetch(POLL_LIMIT);
  let stored = db ? await storedNotices(db, notices.map(n => n.id)) : new Map();
  let backfilled = false;
  if (db && notices.length >= POLL_LIMIT && stored.size === 0) {
    notices = await source.fetch(BACKFILL_LIMIT);
    stored = await storedNotices(db, notices.map(n => n.id));
    backfilled = true;
  }
  const enriched = await enrichWithKeyPoints(notices, { maxFetches: POLL_KEY_POINT_FETCHES, until });
  await archiveNotices(enriched);
  return {
    name: source.name,
    read: notices.length,
    added: notices.filter(n => !stored.has(n.id)).length,
    backfilled,
    withoutKeyPoints: enriched.filter(n => n.dossierUrl && !n.keyPoints).length,
    notices: enriched
  };
}

// Check every source and store what it lists in the history
export async function pollSources(): Promise<{ results: PollResult[]; failed: { name: string; error: string }[] }> {
  const sources = SOURCES.filter(s => s.inDigest !== false);
  const until = Date.now() + POLL_FETCH_WINDOW_MS;
  const settled = await Promise.allSettled(sources.map(s => pollSource(s, until)));
  const results: PollResult[] = [];
  const failed: { name: string; error: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') results.push(r.value);
    else failed.push({ name: sources[i].name, error: describeError(r.reason) });
  });
  return { results, failed };
}

async function collectDigestNotices(): Promise<{ notices: NormalizedNotice[]; failed: string[] }> {
  // The feed's own refresh first, so the check reuses its key points instead
  // of reading the same documents again
  const states = await Promise.all(SOURCES.filter(s => s.inDigest !== false).map(refreshSource));
  const { results, failed } = await pollSources();
  const byId = new Map<string, NormalizedNotice>();
  results.forEach(r => r.notices.forEach(n => byId.set(n.id, n)));
  states.forEach(st => st.notices.forEach(n => { if (n.keyPoints || !byId.has(n.id)) byId.set(n.id, n); }));
  return { notices: dedupeByDocument([...byId.values()]), failed: failed.map(f => f.name) };
}

// How far back the feed reaches into the history, and how many notices at most
const ARCHIVE_FEED_DAYS = 30;
const ARCHIVE_FEED_LIMIT = 300;

// Dates taken from a document's text are worked out again whenever a stored
// notice is read, so a rule change reaches the whole history. Copies stored
// before October 2026 mark them "Date in source", or have a closing date from
// the text on a notice that is not a consultation.
function withoutTextDates(n: NormalizedNotice): NormalizedNotice {
  const legacyClosing = n.keyPoints?.closingDate?.date;
  const fromText = !!n.deadlineQuote || /^Date in source: /.test(n.statutoryDeadline || '') ||
    (!!legacyClosing && n.statutoryDeadline?.match(/^Comments closed?: (.*)$/)?.[1] === legacyClosing && formatOf(n.type, n.title) !== 'Consultations');
  if (!fromText) return n;
  const { deadlineDate: _d, statutoryDeadline: _s, statusBadge: _b, deadlineQuote: _q, ...rest } = n;
  return rest;
}

export const fromArchive = (stored: any): NormalizedNotice => {
  let n = withoutTextDates({
    ...stored,
    archived: true,
    isLiveFeed: false,
    issuedTimeAgo: stored.publishedAt ? getRelativeTime(stored.publishedAt) : 'Earlier'
  });
  // A source's closing date stored while it was still ahead
  const closes = n.statutoryDeadline?.match(/^Comments close: (\d{4}-\d{2}-\d{2})$/)?.[1];
  if (closes) n = { ...n, deadlineDate: undefined, ...closingDateFields(closes) };
  return n.keyPoints ? withKeyPoints(n, n.keyPoints) : tagNotice(n);
};

// Add the last 30 days from the history to the live notices, and link
// consultations to their conclusions
async function withHistory(live: NormalizedNotice[]) {
  const db = await getDb();
  let notices = live;
  let archive: { enabled: boolean; count?: number; since?: string | null; error?: string } = { enabled: false };
  let candidates: RelatedCandidate[] = live;
  if (db) {
    try {
      const liveIds = new Set(live.map(n => n.id));
      const [recent, stats, linkable] = await Promise.all([
        recentNotices(db, ARCHIVE_FEED_DAYS, ARCHIVE_FEED_LIMIT),
        archiveStats(db),
        consultationCandidates(db)
      ]);
      notices = [...live, ...recent.filter(n => !liveIds.has(n.id)).map(fromArchive)];
      archive = { enabled: true, ...stats };
      candidates = [...linkable, ...live.filter(n => !linkable.some(c => c.id === n.id))] as RelatedCandidate[];
    } catch (err: any) {
      console.log(`[RegSonar History] Could not read history: ${err?.message}`);
      archive = { enabled: true, error: 'The history database could not be read' };
    }
  } else if (databaseUrl()) {
    archive = { enabled: true, error: 'The history database could not be reached' };
  }
  notices = dedupeByDocument(notices).map(n => {
    const related = findRelated(n, candidates);
    return related.length ? { ...n, related } : n;
  });
  return { notices, archive };
}

// Scheduled jobs are called by Vercel with "Authorization: Bearer <CRON_SECRET>";
// without that secret they are turned off, so nobody else can run them
function cronAuthorized(req: Request, res: Response, what: string): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ success: false, error: `CRON_SECRET is not set, so ${what} turned off` });
    return false;
  }
  if (req.get('authorization') !== `Bearer ${secret}`) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return false;
  }
  return true;
}

function siteUrl(): string {
  if (process.env.DIGEST_SITE_URL) return process.env.DIGEST_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

// The feed, built at most once a minute per server instance and shared by
// every request in between. Sources are re-read at most every 10 minutes
// anyway; this stops refreshes from re-reading the history database each time.
const SYNC_REUSE_MS = 60_000;
const currentSync = reuseFor(SYNC_REUSE_MS, async () => {
  console.log('[RegSonar Feed Sentinel] Querying live regulatory sources...');
  const [states, endpoints] = await Promise.all([
    Promise.all(SOURCES.map(refreshSource)),
    getEndpointsHealth()
  ]);
  const sources = SOURCES.map((s, i) => ({
    endpointId: s.endpointId,
    name: s.name,
    ok: !states[i].error,
    count: states[i].notices.length,
    lastSuccessAt: states[i].lastSuccessAt,
    error: states[i].error
  }));
  const { notices, archive } = await withHistory(states.flatMap(st => st.notices));
  return { success: true, count: notices.length, lastSync: new Date().toISOString(), notices, archive, sources, endpoints };
});

// Refreshes each visitor may ask for per minute
const REFRESH_LIMIT = 6;
const refreshLimit = rateLimit(REFRESH_LIMIT, 60_000);

// The visitor's IP address. On Vercel, X-Forwarded-For is set by Vercel (a
// value sent by the client is replaced); elsewhere the connection's address.
function visitorIp(req: Request): string {
  const forwarded = process.env.VERCEL ? req.get('x-forwarded-for')?.split(',')[0].trim() : undefined;
  return forwarded || req.socket.remoteAddress || 'unknown';
}

// API routes only. Used by the local server below and by the Vercel
// function in api/index.ts, where the frontend is served as static files.
export function createApp() {
  const app = express();
  // Don't announce the server software
  app.disable('x-powered-by');

  app.use(express.json());

  // Health probe route
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      service: 'RegSonar Ingestion Gateway & Sentinel',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // API Route: Get connected endpoint status and latencies
  app.get('/api/feeds/status', async (_req: Request, res: Response) => {
    try {
      const metrics = await getEndpointsHealth();
      res.json({
        success: true,
        lastChecked: new Date().toISOString(),
        totalEndpoints: metrics.length,
        operationalCount: metrics.filter(m => m.status === 'Operational').length,
        endpoints: metrics
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // API Route: Trigger live sync across all connected endpoints. GET responses
  // may be served from Vercel's CDN cache (up to 5 minutes old, or older while
  // a fresh copy is fetched in the background), so a cold function never makes
  // a visitor wait; lastSync says how old the data is. POST always runs.
  app.all('/api/feeds/sync', async (req: Request, res: Response) => {
    // A refresh (POST) skips the CDN cache, so each visitor may ask for only a few a minute
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const wait = refreshLimit(visitorIp(req));
      if (wait) {
        res.set({ 'Cache-Control': 'no-store', 'Retry-After': String(wait) });
        res.status(429).json({ success: false, error: `Too many refreshes. Try again in ${wait} seconds.` });
        return;
      }
    }
    try {
      const body = await currentSync();
      res.set('Cache-Control', req.method === 'GET' ? 'public, s-maxage=300, stale-while-revalidate=86400' : 'no-store');
      res.json(body);
    } catch (error: any) {
      console.log('[RegSonar Feed Sentinel] Sync catch notice:', error?.message);
      res.status(500).json({ success: false, error: error?.message || 'Sync error' });
    }
  });

  // Scheduled check of every source, run by the cron jobs in vercel.json
  // several times a day (needs CRON_SECRET, like the digest). It stores up to
  // 20 items per source in the history, reading further back when there is a
  // gap, and adds key points a few documents at a time. Then it asks for the
  // public feed so the cached copy visitors get is refreshed too.
  app.get('/api/feeds/poll', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    if (!cronAuthorized(req, res, 'scheduled checks are')) return;
    try {
      const { results, failed } = await pollSources();
      const added = results.reduce((sum, r) => sum + r.added, 0);
      console.log(`[RegSonar Poll] ${added} new notices from ${results.length} sources${failed.length ? `; could not read ${failed.map(f => f.name).join(', ')}` : ''}`);
      const warmed = await fetch(`${siteUrl()}/api/feeds/sync`, { signal: AbortSignal.timeout(30_000) })
        .then(r => r.ok)
        .catch(() => false);
      res.json({
        success: true,
        added,
        feedRefreshed: warmed,
        sources: results.map(({ notices, ...r }) => r),
        failed
      });
    } catch (error: any) {
      console.log('[RegSonar Poll] Failed:', error?.message);
      res.status(500).json({ success: false, error: error?.message || 'Poll failed' });
    }
  });

  // Daily email digest, run by the cron job in vercel.json. Vercel sends
  // "Authorization: Bearer <CRON_SECRET>"; without that secret nothing runs, so
  // nobody else can trigger emails. ?dryRun=1 returns the email instead of
  // sending it, and ?date=YYYY-MM-DD picks the Singapore day (default yesterday).
  app.get('/api/digest', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    if (!cronAuthorized(req, res, 'the digest is')) return;
    try {
      const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
      const day = date || singaporeDate(new Date(), 1);
      const { notices, failed } = await collectDigestNotices();
      const matches = matchDigest(notices, DIGEST_RULES, day);
      const email = renderDigest(matches, day, siteUrl(), failed);
      const summary = { day, checked: notices.length, matched: matches.length, failedSources: failed, subject: email.subject };
      console.log(`[RegSonar Digest] ${day}: ${matches.length} matching of ${notices.length} notices checked${failed.length ? `; could not read ${failed.join(', ')}` : ''}`);

      if (req.query.dryRun === '1') {
        res.json({ success: true, sent: false, ...summary, matches: matches.map(m => ({ id: m.notice.id, title: m.notice.title, rules: m.rules })), html: email.html, text: email.text });
        return;
      }
      if (matches.length === 0) {
        res.json({ success: true, sent: false, reason: 'No matching notices', ...summary });
        return;
      }
      const apiKey = process.env.RESEND_API_KEY;
      const to = (process.env.DIGEST_TO || '').split(',').map(a => a.trim()).filter(Boolean);
      if (!apiKey || to.length === 0) {
        res.status(503).json({ success: false, error: 'RESEND_API_KEY and DIGEST_TO must be set to send the digest', ...summary });
        return;
      }
      const result = await sendWithResend({ apiKey, from: process.env.DIGEST_FROM || 'RegSonar <onboarding@resend.dev>', to, ...email });
      console.log(`[RegSonar Digest] Sent ${day} digest (Resend id ${result.id})`);
      res.json({ success: true, sent: true, id: result.id, ...summary });
    } catch (error: any) {
      console.log('[RegSonar Digest] Failed:', error?.message);
      res.status(500).json({ success: false, error: error?.message || 'Digest failed' });
    }
  });

  // The digest's rules and whether sending is set up (never the address)
  app.get('/api/digest/rules', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      rules: DIGEST_RULES,
      schedule: 'Daily at about 08:00 Singapore time',
      configured: Boolean(process.env.CRON_SECRET && process.env.RESEND_API_KEY && process.env.DIGEST_TO)
    });
  });

  // Search the history: titles, summaries and key points
  app.get('/api/notices/search', async (req: Request, res: Response) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    if (q.length < 2) {
      res.status(400).json({ success: false, error: 'Search needs at least 2 characters' });
      return;
    }
    try {
      const db = await getDb();
      if (!db) {
        res.json({ success: true, enabled: false, notices: [] });
        return;
      }
      const found = dedupeByDocument((await searchNotices(db, q, 40)).map(fromArchive));
      res.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
      res.json({ success: true, enabled: true, notices: found });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'Search failed' });
    }
  });

  // API Route: daily HKMA liquidity figures for the dashboard chart
  app.get('/api/hkma/liquidity-history', async (req: Request, res: Response) => {
    try {
      const range: LiquidityRange = req.query.range === '3m' ? '3m' : '1m';
      const history = await getLiquidityHistory(range);
      // Past figures never change and new ones appear once a business day
      res.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
      res.json({ success: true, ...history });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error?.message || 'Could not load liquidity history' });
    }
  });

  return app;
}

async function startLocalServer() {
  const app = createApp();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

  // Mount Vite or Static Serving
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[RegSonar] Server running on http://0.0.0.0:${PORT}`);
  });
}

// On Vercel the app is imported by api/index.ts instead of listening on a
// port; tests import this file too, so it only listens when run directly
const runDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (!process.env.VERCEL && runDirectly) {
  startLocalServer().catch((err) => {
    console.error('[RegSonar] Fatal error starting server:', err);
    process.exit(1);
  });
}

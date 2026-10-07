import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { summarize, extractArticleText, extractPdfText, earliestDeadline, htmlToText, KeyPoints } from './summarize.js';
import { matchDigest, renderDigest, sendWithResend, singaporeDate } from './digest.js';
import { DIGEST_RULES } from './digest-rules.js';

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
  jurisdictionCode: 'SG' | 'HK' | 'AU' | 'JP' | 'UK_EU' | 'US' | 'GLOBAL';
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
  keyPoints?: KeyPoints;
  tags: string[];
  sector: 'FinTech & Digital Assets' | 'Banking & Capital Markets' | 'ESG & Sustainability' | 'AI Governance & Ethics' | 'AML/CFT & Sanctions';
  format: 'Circulars' | 'Consultations' | 'Enforcement' | 'Guidelines' | 'Technical Standards';
  severity: 'critical' | 'high' | 'info';
  dossierUrl?: string;
  isLiveFeed?: boolean;
  publishedAt?: string;
}

let lastSyncTimestamp = new Date().toISOString();

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
function classifySector(text: string): 'FinTech & Digital Assets' | 'Banking & Capital Markets' | 'ESG & Sustainability' | 'AI Governance & Ethics' | 'AML/CFT & Sanctions' {
  const lower = text.toLowerCase();
  if (lower.includes('crypto') || lower.includes('token') || lower.includes('digital asset') || lower.includes('blockchain') || lower.includes('dpt') || lower.includes('custod')) {
    return 'FinTech & Digital Assets';
  }
  if (lower.includes('esg') || lower.includes('climate') || lower.includes('sustainability') || lower.includes('green') || lower.includes('emission')) {
    return 'ESG & Sustainability';
  }
  if (lower.includes('artificial intelligence') || lower.includes('ai') || lower.includes('algorithmic') || lower.includes('machine learning') || lower.includes('model risk')) {
    return 'AI Governance & Ethics';
  }
  if (lower.includes('aml') || lower.includes('sanction') || lower.includes('money laundering') || lower.includes('cft') || lower.includes('terrorist')) {
    return 'AML/CFT & Sanctions';
  }
  return 'Banking & Capital Markets';
}

// Helper to determine format
function classifyFormat(type: string, title: string): 'Circulars' | 'Consultations' | 'Enforcement' | 'Guidelines' | 'Technical Standards' {
  const lower = (type + ' ' + title).toLowerCase();
  if (lower.includes('proposed') || lower.includes('consult') || lower.includes('comment') || lower.includes('draft')) {
    return 'Consultations';
  }
  if (lower.includes('enforcement') || lower.includes('penalty') || lower.includes('proceeding') || lower.includes('action') || lower.includes('order') ||
      /\b(reprimand(s|ed)?|fine[sd]|ban(s|ned)|sentenced|convicted|prosecut\w*|disciplinary)\b/.test(lower)) {
    return 'Enforcement';
  }
  if (lower.includes('standard') || lower.includes('technical') || lower.includes('interoperability')) {
    return 'Technical Standards';
  }
  if (lower.includes('guideline') || lower.includes('guidance') || lower.includes('policy manual')) {
    return 'Guidelines';
  }
  return 'Circulars';
}

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
const FETCH_TIMEOUT_MS = 8000;

// Rough impact heuristic by instrument format. Not an AI assessment.
function estimateImpact(format: string): number {
  switch (format) {
    case 'Enforcement':
      return 8.5;
    case 'Consultations':
      return 7.8;
    case 'Technical Standards':
      return 7.2;
    case 'Guidelines':
      return 7.0;
    default:
      return 6.5;
  }
}

function severityFor(score: number): 'critical' | 'high' | 'info' {
  return score >= 8.5 ? 'critical' : score >= 7.5 ? 'high' : 'info';
}

function toIso(dateString: string | undefined): string | undefined {
  if (!dateString) return undefined;
  const t = new Date(dateString).getTime();
  return isNaN(t) ? undefined : new Date(t).toISOString();
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchOrThrow(url: string): Promise<globalThis.Response> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { 'User-Agent': REG_USER_AGENT }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res;
}

// Fetch US Federal Register API notices (SEC & CFTC)
async function fetchFederalRegister(limit = 4): Promise<NormalizedNotice[]> {
  // Date fields are only returned when requested by name
  const fields = ['title', 'type', 'abstract', 'agencies', 'document_number', 'citation', 'publication_date', 'comments_close_on', 'effective_on', 'dates', 'html_url', 'pdf_url']
    .map((f) => `&fields[]=${f}`)
    .join('');
  const url = `https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=securities-and-exchange-commission&conditions[agencies][]=commodity-futures-trading-commission&order=newest&per_page=${limit}${fields}`;
  const res = await fetchOrThrow(url);
  const data = await res.json();
  const results = data.results || [];

  return results.map((doc: any, idx: number) => {
    const agencies = doc.agencies?.map((a: any) => a.raw_name || a.name).join(' & ') || 'US SEC & CFTC';
    const isSec = agencies.toLowerCase().includes('securities');
    const reg = isSec ? 'US SEC' : 'US CFTC';
    const format = classifyFormat(doc.type || '', doc.title || '');
    const sector = classifySector((doc.title || '') + ' ' + (doc.abstract || ''));
    const commentsClose: string | undefined = doc.comments_close_on || undefined;
    const effectiveOn: string | undefined = doc.effective_on || undefined;

    let score = 7.5;
    if (doc.type === 'Rule') score = 8.7;
    if (doc.type === 'Proposed Rule') score = 8.1;

    let statutoryDeadline = 'No date published';
    let statusBadge: NormalizedNotice['statusBadge'] = { text: 'Published', type: 'standard' };
    if (commentsClose) {
      statutoryDeadline = `Comments close: ${commentsClose}`;
      statusBadge = { text: `Comments close: ${commentsClose}`, type: 'deadline' };
    } else if (effectiveOn) {
      statutoryDeadline = `Effective: ${effectiveOn}`;
      statusBadge = { text: `Effective: ${effectiveOn}`, type: 'action' };
    }

    return {
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
      tags: [reg, format, 'Federal Register', sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: doc.html_url || doc.pdf_url,
      isLiveFeed: true
    };
  });
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
    const format = classifyFormat('', title);
    const sector = classifySector(title + ' ' + (description || ''));
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
    const format = classifyFormat('', title + ' ' + (description || ''));
    const sector = classifySector(title + ' ' + (description || ''));
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
      const format = feed.format || classifyFormat('', title);
      const sector = classifySector(title);
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
function parseHkmaDailyStats(html: string): LiquidityDay | null {
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
      impactScore: 5.0,
      issuedTimeAgo: getRelativeTime(publishedAt ?? date),
      publishedAt,
      statusBadge: {
        text: `Closing Bal: HK$${closing}M`,
        type: 'standard'
      },
      summary: `Closing aggregate balance HK$${closing}M${rates.length ? `; ${rates.join('; ')}` : ''}. Figures as at ${time}, ${date} (Hong Kong time). Source: HKMA Daily Monetary Statistics page.`,
      tags: ['HKMA', 'Liquidity', 'Banking & Capital Markets'],
      sector: 'Banking & Capital Markets',
      format: 'Circulars',
      severity: 'info',
      dossierUrl: liquidityDayUrl(date),
      isLiveFeed: true
    }
  ];
}

// Fetch MAS media releases and enforcement actions from the search API behind
// mas.gov.sg/news. It is undocumented, and MAS serves a "Maintenance" page to
// non-browser user agents, so this relies on REG_USER_AGENT.
async function fetchMasMediaReleases(limit = 4): Promise<NormalizedNotice[]> {
  const params = new URLSearchParams();
  params.append('q', '*:*');
  params.append('fq', 'mas_mastercontenttypes_sm:"News"');
  params.append('fq', 'mas_contenttype_s:("Media Releases" OR "Enforcement Actions Media Releases")');
  params.append('sort', 'mas_date_tdt desc');
  params.append('rows', String(limit));
  params.append('wt', 'json');
  const res = await fetchOrThrow(`https://www.mas.gov.sg/api/v1/search?${params}`);
  if (!res.headers.get('content-type')?.includes('json')) {
    throw new Error('MAS returned a non-JSON page (possibly maintenance or bot filtering)');
  }
  const data = await res.json();
  const docs: any[] = data.response?.docs || [];

  return docs.map((doc) => {
    const title = stripHtml(String(doc.document_title_string_s));
    const summary = doc.document_shortsummary_t?.[0];
    const isEnforcement = doc.mas_contenttype_s === 'Enforcement Actions Media Releases';
    const format = isEnforcement ? 'Enforcement' : classifyFormat('', title);
    const sector = classifySector(title + ' ' + (summary || ''));
    const score = estimateImpact(format);
    const slug = String(doc.page_url_s).split('/').filter(Boolean).pop();

    return {
      id: `mas-${slug}`,
      ref: `MAS ${doc.mas_contenttype_s}`,
      title,
      regulator: 'MAS',
      jurisdiction: 'SINGAPORE',
      jurisdictionCode: 'SG',
      type: isEnforcement ? 'ENFORCEMENT ACTION' : 'MEDIA RELEASE',
      typeColorClass: getTypeColor(format),
      impactScore: score,
      issuedTimeAgo: getRelativeTime(doc.mas_date_tdt),
      publishedAt: toIso(doc.mas_date_tdt),
      summary,
      tags: ['MAS', format, sector],
      sector,
      format,
      severity: severityFor(score),
      dossierUrl: `https://www.mas.gov.sg${doc.page_url_s}`,
      isLiveFeed: true
    };
  });
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
    const format = classifyFormat('', title);
    const sector = classifySector(title + ' ' + (description || ''));
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
    const format = feed.format || classifyFormat('', title);
    const sector = classifySector(title);
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
function zonedToIso(local: string, timeZone: string): string | undefined {
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
      const format = isEnforcement ? 'Enforcement' : classifyFormat('', title);
      const sector = classifySector(title + ' ' + (summary || ''));
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
      const format = classifyFormat(category, title);
      const sector = classifySector(title);
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
    const res = await fetch(ep.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': REG_USER_AGENT }
    });
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
    refreshSource(SOURCES.find(src => src.fetch === fetchHkmaLiquidity)!)
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
const SOURCES: { endpointId: string; name: string; fetch: (limit?: number) => Promise<NormalizedNotice[]>; ttlMs?: number; inDigest?: false }[] = [
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
  { endpointId: 'mas-gov', name: 'MAS Media Releases', fetch: fetchMasMediaReleases },
  { endpointId: 'asic-gov', name: 'ASIC Media Releases', fetch: fetchAsicMediaReleases },
  { endpointId: 'jfsa-rss', name: 'JFSA News', fetch: fetchJfsaNews },
  { endpointId: 'bis-portal', name: 'BIS Media Releases', fetch: fetchBisPressReleases }
];

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
    const sfcText = await fetchSfcDocText(sourceUrl);
    if (sfcText !== null) {
      text = sfcText;
    } else if (BRDR_PAGE.test(sourceUrl)) {
      ({ text, ocr, pdfUrl: sourceUrl } = await fetchBrdrPdfText(sourceUrl));
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

// Attach key points to notices that link to a document page. Fetches run one
// at a time per source to stay polite to regulator sites.
async function enrichWithKeyPoints(notices: NormalizedNotice[]): Promise<NormalizedNotice[]> {
  const enriched: NormalizedNotice[] = [];
  for (const notice of notices) {
    if (notice.keyPoints || !notice.dossierUrl || notice.id.startsWith('hkma-liquidity')) {
      enriched.push(notice);
      continue;
    }
    const keyPoints = await keyPointsFor(notice);
    if (!keyPoints) {
      enriched.push(notice);
      continue;
    }
    const deadline = earliestDeadline(keyPoints);
    enriched.push({
      ...notice,
      keyPoints,
      ...(deadline && !notice.deadlineDate
        ? {
            deadlineDate: deadline.date,
            statutoryDeadline: `Date in source: ${deadline.date}`,
            statusBadge: { text: `Date in source: ${deadline.date}`, type: 'deadline' as const }
          }
        : {})
    });
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
      .then((notices) => {
        s.notices = notices;
        s.lastSuccessAt = new Date().toISOString();
        s.error = undefined;
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

// The email digest reads up to this many items per source, so a source that
// publishes more in a day than the feed shows is still covered
const DIGEST_FETCH_LIMIT = 20;

async function collectDigestNotices(): Promise<{ notices: NormalizedNotice[]; failed: string[] }> {
  const sources = SOURCES.filter(s => s.inDigest !== false);
  const [states, wide] = await Promise.all([
    Promise.all(sources.map(refreshSource)),
    Promise.allSettled(sources.map(s => s.fetch(DIGEST_FETCH_LIMIT)))
  ]);
  const byId = new Map<string, NormalizedNotice>();
  const failed: string[] = [];
  wide.forEach((result, i) => {
    if (result.status === 'fulfilled') result.value.forEach(n => byId.set(n.id, n));
    else failed.push(sources[i].name);
  });
  // Notices already in the feed carry key points, so they replace the wider read's copies
  states.forEach(st => st.notices.forEach(n => byId.set(n.id, n)));
  return { notices: [...byId.values()], failed };
}

function siteUrl(): string {
  if (process.env.DIGEST_SITE_URL) return process.env.DIGEST_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

// API routes only. Used by the local server below and by the Vercel
// function in api/index.ts, where the frontend is served as static files.
export function createApp() {
  const app = express();

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
    try {
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

      const liveNotices = states.flatMap(st => st.notices);
      lastSyncTimestamp = new Date().toISOString();

      res.set('Cache-Control', req.method === 'GET' ? 'public, s-maxage=300, stale-while-revalidate=86400' : 'no-store');
      res.json({
        success: true,
        count: liveNotices.length,
        lastSync: lastSyncTimestamp,
        notices: liveNotices,
        sources,
        endpoints
      });
    } catch (error: any) {
      console.log('[RegSonar Feed Sentinel] Sync catch notice:', error?.message);
      res.status(500).json({ success: false, error: error?.message || 'Sync error' });
    }
  });

  // Daily email digest, run by the cron job in vercel.json. Vercel sends
  // "Authorization: Bearer <CRON_SECRET>"; without that secret nothing runs, so
  // nobody else can trigger emails. ?dryRun=1 returns the email instead of
  // sending it, and ?date=YYYY-MM-DD picks the Singapore day (default yesterday).
  app.get('/api/digest', async (req: Request, res: Response) => {
    res.set('Cache-Control', 'no-store');
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      res.status(503).json({ success: false, error: 'CRON_SECRET is not set, so the digest is turned off' });
      return;
    }
    if (req.get('authorization') !== `Bearer ${secret}`) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
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

// On Vercel the app is imported by api/index.ts instead of listening on a port
if (!process.env.VERCEL) {
  startLocalServer().catch((err) => {
    console.error('[RegSonar] Fatal error starting server:', err);
    process.exit(1);
  });
}

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { summarize, extractArticleText, extractPdfText, earliestDeadline, KeyPoints } from './summarize.js';

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
  if (lower.includes('enforcement') || lower.includes('penalty') || lower.includes('proceeding') || lower.includes('action') || lower.includes('order')) {
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
async function fetchFederalRegister(): Promise<NormalizedNotice[]> {
  // Date fields are only returned when requested by name
  const fields = ['title', 'type', 'abstract', 'agencies', 'document_number', 'citation', 'publication_date', 'comments_close_on', 'effective_on', 'dates', 'html_url', 'pdf_url']
    .map((f) => `&fields[]=${f}`)
    .join('');
  const url = `https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=securities-and-exchange-commission&conditions[agencies][]=commodity-futures-trading-commission&order=newest&per_page=4${fields}`;
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
async function fetchFcaFeed(): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow('https://www.fca.org.uk/news/rss.xml');
  const xml = await res.text();
  const parsed = xmlParser.parse(xml);
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];
  const slice = (Array.isArray(items) ? items : [items]).slice(0, 3);

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
async function fetchPraPublications(): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow('https://www.bankofengland.co.uk/rss/prudential-regulation-publications');
  const parsed = xmlParser.parse(await res.text());
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items]).slice(0, 4).map((item: any) => {
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

async function fetchHkmaRss(feed: HkmaFeed): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow(`${HKMA_RSS}/${feed.file}`);
  const parsed = xmlParser.parse(await res.text());
  if (!parsed.rss?.channel) {
    throw new Error('Response was not an RSS feed');
  }
  const items = parsed.rss.channel.item || [];

  return (Array.isArray(items) ? items : [items])
    .filter((item: any) => item.title && !HKMA_ROUTINE_RELEASE.test(String(item.title)))
    .slice(0, feed.limit)
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

const fetchHkmaPressReleases = () =>
  fetchHkmaRss({ file: 'rss_press-release.xml', idPrefix: 'hkma-pr', refLabel: 'HKMA Press Release', type: 'PRESS RELEASE', limit: 4 });
const fetchHkmaCirculars = () =>
  fetchHkmaRss({ file: 'rss_circulars.xml', idPrefix: 'hkma-cir', refLabel: 'HKMA Circular', type: 'CIRCULAR', limit: 3 });
const fetchHkmaConsultations = () =>
  fetchHkmaRss({ file: 'rss_consultations.xml', idPrefix: 'hkma-con', refLabel: 'HKMA Consultation', type: 'CONSULTATION', format: 'Consultations', limit: 3 });

// Fetch the latest HKMA interbank liquidity figures from the Daily Monetary
// Statistics page on www.hkma.gov.hk. The same figures are in the HKMA Open
// API, but its firewall blocks cloud servers (Vercel and GitHub Actions alike).
const HKMA_DAILY_STATS_PAGE = 'https://www.hkma.gov.hk/eng/data-publications-and-research/data-and-statistics/daily-monetary-statistics/';

async function fetchHkmaLiquidity(): Promise<NormalizedNotice[]> {
  const html = await (await fetchOrThrow(HKMA_DAILY_STATS_PAGE)).text();
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  // The figure that follows a label, within the same table cell or the next
  const figureAfter = (label: string, value: RegExp) =>
    text.match(new RegExp(label + /[^%\d]{0,80}?/.source + value.source))?.[1];

  const closing = figureAfter('Closing Aggregate Balance', /([\d,]+) mn/);
  const baseRate = figureAfter('Base Rate', /([\d.]+)%/);
  const overnight = figureAfter('Overnight HIBOR', /([\d.]+)%/);
  const fixing1m = figureAfter('1-Month HIBOR Fixing', /([\d.]+)%/);
  const asOf = text.match(/Date and Time \(日期和時間\) : (\d{2}:\d{2}), (\d{2})\/(\d{2})\/(\d{4})/);
  if (!closing || !asOf) throw new Error('Figures not found on the HKMA Daily Monetary Statistics page');

  const [, time, day, month, year] = asOf;
  const date = `${year}-${month}-${day}`;
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
      dossierUrl: HKMA_DAILY_STATS_PAGE,
      isLiveFeed: true
    }
  ];
}

// Fetch MAS media releases and enforcement actions from the search API behind
// mas.gov.sg/news. It is undocumented, and MAS serves a "Maintenance" page to
// non-browser user agents, so this relies on REG_USER_AGENT.
async function fetchMasMediaReleases(): Promise<NormalizedNotice[]> {
  const params = new URLSearchParams();
  params.append('q', '*:*');
  params.append('fq', 'mas_mastercontenttypes_sm:"News"');
  params.append('fq', 'mas_contenttype_s:("Media Releases" OR "Enforcement Actions Media Releases")');
  params.append('sort', 'mas_date_tdt desc');
  params.append('rows', '4');
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
async function fetchBisPressReleases(): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow('https://www.bis.org/doclist/all_pressrels.rss');
  const parsed = xmlParser.parse(await res.text());
  const items = parsed['rdf:RDF']?.item;
  if (!items) {
    throw new Error('Response was not an RSS feed');
  }

  return (Array.isArray(items) ? items : [items]).slice(0, 4).map((item: any) => {
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
    id: 'asic-gov',
    name: 'Australia ASIC Portal',
    agency: 'ASIC (Australia)',
    jurisdiction: 'Australia',
    url: 'https://asic.gov.au',
    protocol: 'HTTPS Portal',
    auth: 'Public / None',
    ingests: false
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

// Ingestion sources, keyed to the endpoint they read from
const SOURCES: { endpointId: string; name: string; fetch: () => Promise<NormalizedNotice[]>; ttlMs?: number }[] = [
  { endpointId: 'fed-reg', name: 'US Federal Register', fetch: fetchFederalRegister },
  { endpointId: 'fca-rss', name: 'UK FCA News RSS', fetch: fetchFcaFeed },
  { endpointId: 'boe-pra', name: 'UK PRA Publications', fetch: fetchPraPublications },
  { endpointId: 'hkma-rss', name: 'HKMA Press Releases', fetch: fetchHkmaPressReleases },
  { endpointId: 'hkma-rss', name: 'HKMA Circulars', fetch: fetchHkmaCirculars },
  { endpointId: 'hkma-rss', name: 'HKMA Consultations', fetch: fetchHkmaConsultations },
  { endpointId: 'hkma-dms', name: 'HKMA Interbank Liquidity', fetch: fetchHkmaLiquidity, ttlMs: HKMA_SOURCE_TTL_MS },
  { endpointId: 'mas-gov', name: 'MAS Media Releases', fetch: fetchMasMediaReleases },
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

async function keyPointsFor(notice: NormalizedNotice): Promise<KeyPoints | null> {
  if (keyPointsCache.has(notice.id)) return keyPointsCache.get(notice.id)!;
  try {
    let text: string;
    let ocr = false;
    let sourceUrl = notice.dossierUrl!;
    if (BRDR_PAGE.test(sourceUrl)) {
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

  // API Route: Trigger live sync across all connected endpoints
  app.all('/api/feeds/sync', async (_req: Request, res: Response) => {
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

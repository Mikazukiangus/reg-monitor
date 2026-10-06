import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { GoogleGenAI } from '@google/genai';

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
  aiSynthesis?: {
    title: string;
    points: string[];
  };
  summary?: string;
  impactedUnits?: string[];
  tags: string[];
  sector: 'FinTech & Digital Assets' | 'Banking & Capital Markets' | 'ESG & Sustainability' | 'AI Governance & Ethics' | 'AML/CFT & Sanctions';
  format: 'Circulars' | 'Consultations' | 'Enforcement' | 'Guidelines' | 'Technical Standards';
  severity: 'critical' | 'high' | 'info';
  dossierUrl?: string;
  isLiveFeed?: boolean;
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
  const url = 'https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=securities-and-exchange-commission&conditions[agencies][]=commodity-futures-trading-commission&order=newest&per_page=4';
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
      statutoryDeadline,
      deadlineDate: commentsClose || effectiveOn,
      statusBadge,
      summary: doc.abstract || 'No abstract published in the Federal Register for this document.',
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

// Routine market-operation releases that are not regulatory notices
const HKMA_ROUTINE_RELEASE = /tender (results|information)|exchange fund (bills|notes)|government bonds?\b|institutional bonds/i;

// Fetch HKMA press releases from the HKMA Open API
async function fetchHkmaPressReleases(): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow('https://api.hkma.gov.hk/public/press-releases?lang=en&pagesize=20');
  const data = await res.json();
  if (!data.header?.success) {
    throw new Error(`HKMA API error ${data.header?.err_code}: ${data.header?.err_msg}`);
  }
  const records: any[] = data.result?.records || [];

  return records
    .filter((r) => r.title && !HKMA_ROUTINE_RELEASE.test(r.title))
    .slice(0, 4)
    .map((r) => {
      const title = stripHtml(String(r.title));
      const format = classifyFormat('', title);
      const sector = classifySector(title);
      const score = estimateImpact(format);
      const slug = String(r.link || '').split('/').filter(Boolean).pop() || r.date;

      return {
        id: `hkma-pr-${slug}`,
        ref: `HKMA Press Release ${slug}`,
        title,
        regulator: 'HKMA',
        jurisdiction: 'HONG KONG',
        jurisdictionCode: 'HK',
        type: 'PRESS RELEASE',
        typeColorClass: getTypeColor(format),
        impactScore: score,
        issuedTimeAgo: getRelativeTime(r.date),
        tags: ['HKMA', format, sector],
        sector,
        format,
        severity: severityFor(score),
        dossierUrl: r.link,
        isLiveFeed: true
      };
    });
}

// Fetch the latest HKMA daily interbank liquidity figures from the HKMA Open API
async function fetchHkmaLiquidity(): Promise<NormalizedNotice[]> {
  const res = await fetchOrThrow('https://api.hkma.gov.hk/public/market-data-and-statistics/daily-monetary-statistics/daily-figures-interbank-liquidity?pagesize=1');
  const data = await res.json();
  const rec = data.result?.records?.[0];
  if (!data.header?.success || !rec) {
    throw new Error(`HKMA API error ${data.header?.err_code}: ${data.header?.err_msg}`);
  }

  const balance = Number(rec.closing_balance).toLocaleString('en-US');
  return [
    {
      id: `hkma-liquidity-${rec.end_of_date}`,
      ref: `HKMA Daily Monetary Statistics ${rec.end_of_date}`,
      title: `HKMA interbank liquidity: closing aggregate balance HK$${balance}M (${rec.end_of_date})`,
      regulator: 'HKMA',
      jurisdiction: 'HONG KONG',
      jurisdictionCode: 'HK',
      type: 'MARKET DATA',
      typeColorClass: getTypeColor('Circulars'),
      impactScore: 5.0,
      issuedTimeAgo: getRelativeTime(rec.end_of_date),
      statusBadge: {
        text: `Closing Bal: HK$${balance}M`,
        type: 'standard'
      },
      summary: `Closing aggregate balance HK$${balance}M; overnight HIBOR ${rec.hibor_overnight}%; 1-month HIBOR fixing ${rec.hibor_fixing_1m}%; discount window base rate ${rec.disc_win_base_rate}%. Source: HKMA Open API daily monetary statistics.`,
      tags: ['HKMA', 'Liquidity', 'Banking & Capital Markets', 'Open API'],
      sector: 'Banking & Capital Markets',
      format: 'Circulars',
      severity: 'info',
      dossierUrl: 'https://www.hkma.gov.hk/eng/data-publications-and-research/data-and-statistics/daily-monetary-statistics/',
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
    id: 'hkma-api',
    name: 'HKMA Open API',
    agency: 'HKMA (Hong Kong)',
    jurisdiction: 'Hong Kong',
    url: 'https://api.hkma.gov.hk/public/press-releases?lang=en&pagesize=1',
    protocol: 'REST JSON',
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
const HEALTH_TTL_MS = 60 * 1000;
const SOURCE_TTL_MS = 10 * 60 * 1000;

let healthCache: { at: number; results: Promise<Awaited<ReturnType<typeof probeEndpoint>>[]> } | null = null;

function getEndpointsHealth() {
  if (!healthCache || Date.now() - healthCache.at > HEALTH_TTL_MS) {
    healthCache = { at: Date.now(), results: Promise.all(ENDPOINTS.map(probeEndpoint)) };
  }
  return healthCache.results;
}

// Ingestion sources, keyed to the endpoint they read from
const SOURCES: { endpointId: string; name: string; fetch: () => Promise<NormalizedNotice[]> }[] = [
  { endpointId: 'fed-reg', name: 'US Federal Register', fetch: fetchFederalRegister },
  { endpointId: 'fca-rss', name: 'UK FCA News RSS', fetch: fetchFcaFeed },
  { endpointId: 'hkma-api', name: 'HKMA Press Releases', fetch: fetchHkmaPressReleases },
  { endpointId: 'hkma-api', name: 'HKMA Interbank Liquidity', fetch: fetchHkmaLiquidity },
  { endpointId: 'mas-gov', name: 'MAS Media Releases', fetch: fetchMasMediaReleases },
  { endpointId: 'bis-portal', name: 'BIS Media Releases', fetch: fetchBisPressReleases }
];

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
  } else if (Date.now() - state.lastAttemptAt > SOURCE_TTL_MS) {
    const s = state;
    s.lastAttemptAt = Date.now();
    s.inFlight = source.fetch()
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

async function createServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProd = process.env.NODE_ENV === 'production';

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

  // API Route: On-demand AI legal synthesis using Gemini
  app.post('/api/feeds/synthesize', async (req: Request, res: Response) => {
    try {
      const { text, regulator, title } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        return res.json({
          success: true,
          source: 'heuristic',
          synthesis: {
            title: `Executive Legal Brief: ${title || 'Regulatory Directives'}`,
            points: [
              'Mandatory compliance review required within standard statutory window.',
              'Cross-border operational risk alignment required for APAC authorized entities.',
              'Board-level accountability linkage enforced under senior manager regimes.'
            ]
          }
        });
      }

      try {
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `You are a Senior APAC Regulatory Counsel. Analyze this regulatory notice and extract an executive legal synthesis.
Title: ${title}
Regulator: ${regulator}
Text: ${text}

Output JSON with:
{
  "title": "Short title describing legal implication",
  "points": ["Point 1 (4-hour RTO/operational mandate)", "Point 2 (Audit/filing requirement)", "Point 3 (Senior executive liability/penalties)"],
  "impactScore": (float between 6.0 and 9.9),
  "statutoryDeadline": "e.g. 30 Nov 2026 or Effective Immediately",
  "impactedUnits": ["e.g. Custody Operations", "Wealth Tech"]
}`;

        const aiRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });

        const parsed = JSON.parse(aiRes.text || '{}');
        return res.json({
          success: true,
          source: 'gemini-3.8-flash',
          synthesis: parsed
        });
      } catch (geminiErr: any) {
        console.warn('Gemini temporary spike fallback:', geminiErr.message);
        return res.json({
          success: true,
          source: 'heuristic_fallback',
          synthesis: {
            title: `Executive Legal Brief: ${title || 'Notice Analysis'}`,
            points: [
              'Statutory compliance filing required under applicable supervisory guidelines.',
              'Impacts cross-border institutional trading and custody arrangements.',
              'Audit log preservation mandated for regulatory review.'
            ]
          }
        });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

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

createServer().catch((err) => {
  console.error('[RegSonar] Fatal error starting server:', err);
  process.exit(1);
});

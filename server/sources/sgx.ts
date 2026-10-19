import { htmlToText } from '../../summarize.js';
import { fetchOrThrow } from '../http.js';
import { type NormalizedNotice, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor, formatOf } from '../notice.js';
import { stripHtml, closingDateFields, singaporeDay } from '../text.js';

// Singapore Exchange Regulation (SGX RegCo). Its pages are filled in from SGX's
// own content API, which the server reads directly: the lists of public
// consultations (with issue and closing dates) and public disciplinary
// actions, and the SGX Group media list filtered to regulatory items.
export const SGX_CONTENT_API = 'https://api2.sgx.com/regco/content-api';
export const SGX_QUERY_ID = 'e4da21521b39e5324f96273260acfd8e1a9d1e5e';
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

export async function fetchSgxConsultations(limit = 3): Promise<NormalizedNotice[]> {
  const items = await sgxList('public_consultations_list', limit);
  return items.map(item => {
    const notice = sgxNotice(item, { idPrefix: 'sgx-con', type: 'CONSULTATION', format: 'Consultations', unixDate: item.dateIssue });
    return item.dateClosed ? { ...notice, ...closingDateFields(singaporeDay(item.dateClosed)) } : notice;
  });
}

export async function fetchSgxDisciplinaryActions(limit = 3): Promise<NormalizedNotice[]> {
  const items = await sgxList('public_disciplinary_actions_list', limit);
  return items.map(item => sgxNotice(item, { idPrefix: 'sgx-disc', type: 'DISCIPLINARY ACTION', format: 'Enforcement', unixDate: item.dateAnnounced }));
}

const sgxNames = (field: any[] | null | undefined): string[] =>
  (field || []).map(t => t?.data?.data?.name).filter(Boolean);

// Speeches are SGX Group's as a whole; those given for SGX RegCo say so in the title
const SGX_REGCO_SPEAKER = /SGX RegCo|Singapore Exchange Regulation/i;

export async function fetchSgxRegulatoryNews(limit = 3): Promise<NormalizedNotice[]> {
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
export async function fetchSgxDocText(pageUrl: string): Promise<string | null> {
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

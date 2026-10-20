import { fetchOrThrow } from '../http.js';
import { type NormalizedNotice, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor, formatOf } from '../notice.js';
import { zonedToIso, stripHtml, closingDateFields } from '../text.js';

// Search the MAS website's search API (behind mas.gov.sg/news). It is
// undocumented, and MAS serves a "Maintenance" page to non-browser user
// agents, so this relies on REG_USER_AGENT.
async function searchMas(contentTypes: string[], limit: number): Promise<any> {
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
  return res.json();
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

// The documents in a reply from MAS's search API
export const masDocs = (data: any): any[] => data.response?.docs || [];

// MAS media releases and enforcement actions
export async function fetchMasMediaReleases(limit = 4): Promise<NormalizedNotice[]> {
  return parseMasMediaReleases(await searchMas(['Media Releases', 'Enforcement Actions Media Releases'], limit));
}

export function parseMasMediaReleases(data: any): NormalizedNotice[] {
  return masDocs(data).map((doc) => {
    const title = stripHtml(String(doc.document_title_string_s));
    const isEnforcement = doc.mas_contenttype_s === 'Enforcement Actions Media Releases';
    return masNotice(doc, isEnforcement ? 'ENFORCEMENT ACTION' : 'MEDIA RELEASE', isEnforcement ? 'Enforcement' : formatOf('', title));
  });
}

// MAS consultation papers, with the closing date MAS publishes for each
export async function fetchMasConsultations(limit = 3): Promise<NormalizedNotice[]> {
  return parseMasConsultations(await searchMas(['Consultations'], limit));
}

export function parseMasConsultations(data: any): NormalizedNotice[] {
  return masDocs(data).map((doc) => {
    const notice = masNotice(doc, 'CONSULTATION', 'Consultations');
    const closes = masDate(doc.masconsultation_closingdate_tdt);
    if (!closes) return notice;
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date(closes));
    return { ...notice, ...closingDateFields(date) };
  });
}

// MAS circulars and guidelines
export async function fetchMasRegulatoryPublications(limit = 3): Promise<NormalizedNotice[]> {
  return parseMasRegulatoryPublications(await searchMas(['Circulars', 'Guidelines'], limit));
}

export function parseMasRegulatoryPublications(data: any): NormalizedNotice[] {
  return masDocs(data).map((doc) =>
    masNotice(doc, doc.mas_contenttype_s === 'Guidelines' ? 'GUIDELINES' : 'CIRCULAR', doc.mas_contenttype_s === 'Guidelines' ? 'Guidelines' : 'Circulars')
  );
}

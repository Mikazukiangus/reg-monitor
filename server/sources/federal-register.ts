import { summarize } from '../summarize.js';
import { mentionsAi } from '../../src/lib/aiTopics.js';
import { fetchOrThrow } from '../http.js';
import { type NormalizedNotice, formatOf, sectorOf, estimateImpact, getTypeColor, getRelativeTime, severityFor } from '../notice.js';
import { toIso } from '../text.js';
import { NO_DATE, withKeyPointsUntagged } from '../dates.js';

// Date fields are only returned when requested by name
const FEDERAL_REGISTER_FIELDS = ['title', 'type', 'abstract', 'agencies', 'document_number', 'citation', 'publication_date', 'comments_close_on', 'effective_on', 'dates', 'html_url', 'pdf_url']
  .map((f) => `&fields[]=${f}`)
  .join('');

// Fetch US Federal Register API notices (SEC & CFTC)
export async function fetchFederalRegister(limit = 4): Promise<NormalizedNotice[]> {
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

// US federal documents on AI from any agency: executive orders, rules,
// proposals and requests for information. The Federal Register's search finds
// "artificial intelligence" anywhere in a document, often in passing, so only
// documents whose title is about AI are kept, less meeting, nomination and
// paperwork notices.
export const FEDERAL_REGISTER_AI = 'https://www.federalregister.gov/api/v1/documents.json?conditions[term]=%22artificial+intelligence%22&order=newest';
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

export async function fetchFederalRegisterAi(limit = 4): Promise<NormalizedNotice[]> {
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

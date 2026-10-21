// Every source the server reads, and the address each endpoint's status is
// checked at. One file per regulator in this folder holds its adapter.
import { ENDPOINT_CATALOG, type EndpointId, type EndpointInfo } from '../../shared/endpoints.js';
import { type NormalizedNotice, tagNotice } from '../notice.js';
import { FEDERAL_REGISTER_AI, fetchFederalRegister, fetchFederalRegisterAi } from './federal-register.js';
import { fetchFcaFeed } from './fca.js';
import { fetchPraPublications } from './pra.js';
import { fetchHkmaPressReleases, fetchHkmaCirculars, fetchHkmaConsultations } from './hkma.js';
import { fetchMasMediaReleases, fetchMasConsultations, fetchMasRegulatoryPublications } from './mas.js';
import { fetchBisPressReleases } from './bis.js';
import { SFC_RSS, fetchSfcPressReleases, fetchSfcCirculars, fetchSfcConsultations } from './sfc.js';
import { ASIC_MEDIA_RELEASES, fetchAsicMediaReleases } from './asic.js';
import { JFSA_RSS, fetchJfsaNews } from './jfsa.js';
import { bnmYearPage, fetchBnmPressReleases } from './bnm.js';
import { SC_MEDIA_RELEASES, fetchScMediaReleases } from './sc.js';
import { HKEX_REGULATORY_RSS, fetchHkexRegulatory } from './hkex.js';
import { FSB_RSS, fetchFsbPublications } from './fsb.js';
import { ESMA_RSS, fetchEsmaNews } from './esma.js';
import { SGX_CONTENT_API, SGX_QUERY_ID, fetchSgxConsultations, fetchSgxDisciplinaryActions, fetchSgxRegulatoryNews } from './sgx.js';
import { ASX_CONSULTATIONS_PAGE, fetchAsxConsultations } from './asx.js';
import { FINRA_NOTICES_RSS, fetchFinraNotices } from './finra.js';
import { JPX_REVISIONS_BASE, fetchJpxRuleRevisions } from './jpx.js';
import { EC_AI_NEWS, fetchEcAiNews } from './ec.js';
import { FTC, CALIFORNIA_GOVERNOR_AI, CALPRIVACY, COLORADO_AG_AI, COLORADO_AG_AI_RULEMAKING, fetchAiFeed, fetchColoradoAiRulemaking } from './us-feeds.js';
import { MSIT_LIST, fetchMsitPressReleases } from './msit.js';
import { GOV_CN_POLICY_SEARCH, GOV_CN_AI, GOV_CN_PRIVACY, fetchGovCnAiPolicies, fetchGovCnPrivacyPolicies } from './gov-cn.js';
import { GOV_UK_AI, fetchUkAiPolicy } from './gov-uk.js';
import { CAO_AI_TOPICS, fetchCaoAiTopics } from './cao.js';
import { ICO_NEWS_PAGE, fetchIcoNews } from './ico.js';
import { EDPB_RSS, fetchEdpbNews } from './edpb.js';
import { PDPC_LIST, fetchPdpcNews } from './pdpc.js';
import { JPDP_RSS, fetchJpdpNews } from './jpdp.js';
import { OAIC_NEWS, fetchOaicNews } from './oaic.js';
import { PPC_NEWS, fetchPpcNews } from './ppc.js';
import { PIPC_LIST, fetchPipcNotices } from './pipc.js';

// The address each endpoint's status is checked at, built from the source
// adapters' constants. Every endpoint in the shared catalog needs one.
const PROBE_URLS: Record<EndpointId, string> = {
  'fed-reg': 'https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=securities-and-exchange-commission&order=newest&per_page=1',
  'hkma-rss': 'https://www.hkma.gov.hk/eng/other-information/rss/rss_press-release.xml',
  'fca-rss': 'https://www.fca.org.uk/news/rss.xml',
  'boe-pra': 'https://www.bankofengland.co.uk/rss/prudential-regulation-publications',
  'mas-gov': 'https://www.mas.gov.sg/api/v1/search?q=*:*&rows=1&wt=json',
  'sfc-rss': `${SFC_RSS}/Press-releases`,
  'hkex-rss': HKEX_REGULATORY_RSS,
  'esma-rss': ESMA_RSS,
  'ec-ai': EC_AI_NEWS,
  'govuk-ai': `${GOV_UK_AI}&count=1`,
  'fedreg-ai': `${FEDERAL_REGISTER_AI}&per_page=1`,
  'ftc-rss': FTC.url,
  'ca-gov': CALIFORNIA_GOVERNOR_AI.url,
  calprivacy: CALPRIVACY.url,
  'co-ag': COLORADO_AG_AI.url,
  'co-ag-ai': COLORADO_AG_AI_RULEMAKING,
  'msit-kr': MSIT_LIST,
  'govcn-ai': GOV_CN_POLICY_SEARCH(GOV_CN_AI, 1),
  'cao-ai': CAO_AI_TOPICS,
  ico: ICO_NEWS_PAGE,
  edpb: EDPB_RSS,
  pdpc: PDPC_LIST(1),
  jpdp: JPDP_RSS,
  oaic: OAIC_NEWS(1),
  ppc: PPC_NEWS,
  pipc: PIPC_LIST,
  'govcn-privacy': GOV_CN_POLICY_SEARCH(GOV_CN_PRIVACY, 1),
  'fsb-rss': FSB_RSS,
  'asic-gov': ASIC_MEDIA_RELEASES,
  'jfsa-rss': JFSA_RSS,
  'sgx-regco': `${SGX_CONTENT_API}?queryId=${SGX_QUERY_ID}%3Apublic_consultations_list&variables=%7B%22limit%22%3A1%2C%22offset%22%3A0%2C%22lang%22%3A%22EN%22%7D`,
  'asx-consult': ASX_CONSULTATIONS_PAGE,
  'jpx-rules': JPX_REVISIONS_BASE + 'index.html',
  'bnm-rss': bnmYearPage(new Date().getUTCFullYear()),
  'sc-my': SC_MEDIA_RELEASES,
  'finra-rss': FINRA_NOTICES_RSS,
  'bis-portal': 'https://www.bis.org/doclist/all_pressrels.rss'
};

export type EndpointDefinition = EndpointInfo & { url: string };

export const ENDPOINTS: EndpointDefinition[] = ENDPOINT_CATALOG.map(endpoint => ({ ...endpoint, url: PROBE_URLS[endpoint.id] }));

// Ingestion sources, keyed to the endpoint they read from
// fetch(limit) reads more than the feed's usual number of items; the email digest uses this
// narrowed: keeps only the feed's items about AI rules or privacy, so a read may find none
// id: the source's stable name in the history (notice_sources) and the
// scheduled-check log; keep it when renaming the source
type SourceDefinition = { id: string; endpointId: EndpointId; name: string; fetch: (limit?: number) => Promise<NormalizedNotice[]>; narrowed?: true };

const SOURCE_LIST: SourceDefinition[] = [
  { id: 'us-federal-register', endpointId: 'fed-reg', name: 'US Federal Register', fetch: fetchFederalRegister },
  { id: 'uk-fca-news', endpointId: 'fca-rss', name: 'UK FCA News RSS', fetch: fetchFcaFeed },
  { id: 'uk-pra-publications', endpointId: 'boe-pra', name: 'UK PRA Publications', fetch: fetchPraPublications },
  { id: 'hkma-press-releases', endpointId: 'hkma-rss', name: 'HKMA Press Releases', fetch: fetchHkmaPressReleases },
  { id: 'hkma-circulars', endpointId: 'hkma-rss', name: 'HKMA Circulars', fetch: fetchHkmaCirculars },
  { id: 'hkma-consultations', endpointId: 'hkma-rss', name: 'HKMA Consultations', fetch: fetchHkmaConsultations },
  { id: 'sfc-press-releases', endpointId: 'sfc-rss', name: 'SFC Press Releases', fetch: fetchSfcPressReleases },
  { id: 'sfc-circulars', endpointId: 'sfc-rss', name: 'SFC Circulars', fetch: fetchSfcCirculars },
  { id: 'sfc-consultations', endpointId: 'sfc-rss', name: 'SFC Consultations', fetch: fetchSfcConsultations },
  { id: 'hkex-regulatory-announcements', endpointId: 'hkex-rss', name: 'HKEX Regulatory Announcements', fetch: fetchHkexRegulatory },
  { id: 'mas-media-releases', endpointId: 'mas-gov', name: 'MAS Media Releases', fetch: fetchMasMediaReleases },
  { id: 'mas-consultations', endpointId: 'mas-gov', name: 'MAS Consultations', fetch: fetchMasConsultations },
  { id: 'mas-circulars-guidelines', endpointId: 'mas-gov', name: 'MAS Circulars & Guidelines', fetch: fetchMasRegulatoryPublications },
  { id: 'asic-media-releases', endpointId: 'asic-gov', name: 'ASIC Media Releases', fetch: fetchAsicMediaReleases },
  { id: 'jfsa-news', endpointId: 'jfsa-rss', name: 'JFSA News', fetch: fetchJfsaNews },
  { id: 'esma-news', endpointId: 'esma-rss', name: 'ESMA News', fetch: fetchEsmaNews },
  { id: 'fsb-publications', endpointId: 'fsb-rss', name: 'FSB Publications', fetch: fetchFsbPublications },
  { id: 'sgx-regco-consultations', endpointId: 'sgx-regco', name: 'SGX RegCo Consultations', fetch: fetchSgxConsultations },
  { id: 'sgx-regco-disciplinary-actions', endpointId: 'sgx-regco', name: 'SGX RegCo Disciplinary Actions', fetch: fetchSgxDisciplinaryActions },
  { id: 'sgx-regco-announcements', endpointId: 'sgx-regco', name: 'SGX RegCo Announcements', fetch: fetchSgxRegulatoryNews },
  { id: 'asx-public-consultations', endpointId: 'asx-consult', name: 'ASX Public Consultations', fetch: fetchAsxConsultations },
  { id: 'jpx-rule-revisions', endpointId: 'jpx-rules', name: 'JPX Rule Revisions', fetch: fetchJpxRuleRevisions },
  { id: 'finra-notices', endpointId: 'finra-rss', name: 'FINRA Notices', fetch: fetchFinraNotices },
  { id: 'bnm-press-releases', endpointId: 'bnm-rss', name: 'BNM Press Releases', fetch: fetchBnmPressReleases },
  { id: 'sc-malaysia-media-releases', endpointId: 'sc-my', name: 'SC Malaysia Media Releases', fetch: fetchScMediaReleases },
  { id: 'bis-media-releases', endpointId: 'bis-portal', name: 'BIS Media Releases', fetch: fetchBisPressReleases },
  // Rules for artificial intelligence, from the official source in each
  // jurisdiction that makes or enforces them. General government feeds are
  // narrowed to items about AI rules (shared/aiTopics.ts), so a read of one
  // may find none.
  { id: 'ec-ai-news', endpointId: 'ec-ai', name: 'European Commission AI News', fetch: fetchEcAiNews, narrowed: true },
  { id: 'uk-dsit-ai-security-institute', endpointId: 'govuk-ai', name: 'UK DSIT & AI Security Institute', fetch: fetchUkAiPolicy, narrowed: true },
  { id: 'us-federal-register-ai', endpointId: 'fedreg-ai', name: 'US Federal Register: AI', fetch: fetchFederalRegisterAi, narrowed: true },
  { id: 'ftc-ai-privacy', endpointId: 'ftc-rss', name: 'FTC on AI and Privacy', fetch: (limit = 4) => fetchAiFeed(FTC, limit), narrowed: true },
  { id: 'california-governor-ai', endpointId: 'ca-gov', name: 'California Governor on AI', fetch: (limit = 4) => fetchAiFeed(CALIFORNIA_GOVERNOR_AI, limit), narrowed: true },
  { id: 'calprivacy-news', endpointId: 'calprivacy', name: 'CalPrivacy News', fetch: (limit = 4) => fetchAiFeed(CALPRIVACY, limit) },
  { id: 'colorado-ag-ai', endpointId: 'co-ag', name: 'Colorado AG on AI', fetch: (limit = 4) => fetchAiFeed(COLORADO_AG_AI, limit), narrowed: true },
  { id: 'colorado-ag-ai-rulemaking', endpointId: 'co-ag-ai', name: 'Colorado AG AI Rulemaking', fetch: fetchColoradoAiRulemaking },
  { id: 'korea-msit-ai', endpointId: 'msit-kr', name: 'Korea MSIT on AI', fetch: fetchMsitPressReleases, narrowed: true },
  { id: 'china-policy-library-ai', endpointId: 'govcn-ai', name: 'China State Council Policy Library: AI', fetch: fetchGovCnAiPolicies, narrowed: true },
  { id: 'japan-cabinet-office-ai', endpointId: 'cao-ai', name: 'Japan Cabinet Office AI Strategy', fetch: fetchCaoAiTopics },
  // Data privacy (the FTC and CalPrivacy above also cover it), from the data
  // protection authority of each jurisdiction. A privacy regulator's own news
  // is kept whole, less speeches, events and procurement notices; feeds that
  // also cover other work (the FTC's and the OAIC's, China's policy library)
  // are narrowed by shared/privacyTopics.ts. Every notice from these sources
  // is tagged "Data privacy".
  { id: 'uk-ico-news', endpointId: 'ico', name: 'UK ICO News', fetch: fetchIcoNews },
  { id: 'edpb-news', endpointId: 'edpb', name: 'EDPB News', fetch: fetchEdpbNews },
  { id: 'singapore-pdpc-news', endpointId: 'pdpc', name: 'Singapore PDPC News', fetch: fetchPdpcNews },
  { id: 'malaysia-jpdp-announcements', endpointId: 'jpdp', name: 'Malaysia JPDP Announcements', fetch: fetchJpdpNews },
  { id: 'australia-oaic-privacy', endpointId: 'oaic', name: 'Australia OAIC on Privacy', fetch: fetchOaicNews, narrowed: true },
  { id: 'japan-ppc-news', endpointId: 'ppc', name: 'Japan PPC News', fetch: fetchPpcNews },
  { id: 'korea-pipc-notices', endpointId: 'pipc', name: 'Korea PIPC Notices', fetch: fetchPipcNotices },
  { id: 'china-policy-library-personal-information', endpointId: 'govcn-privacy', name: 'China State Council Policy Library: Personal Information', fetch: fetchGovCnPrivacyPolicies, narrowed: true }
];

// Every source's notices get their sectors (with reasons) the same way
export const SOURCES: SourceDefinition[] = SOURCE_LIST.map(source => ({
  ...source,
  fetch: (limit?: number) => source.fetch(limit).then(notices => notices.map(tagNotice))
}));

// The regulator sites and APIs RegSonar reads or checks, shared by the
// server (which probes each one and reads notices from those that ingest) and
// the browser (which lists them before the first status arrives). The address
// each one is checked at lives with the server's source code (PROBE_URLS in
// server.ts), since it is built from the sources' own constants.
export interface EndpointInfo {
  id: string;
  name: string;
  agency: string;
  jurisdiction: string;
  protocol: string;
  auth: string;
  // false: checked for status only, no notices read from it
  ingests: boolean;
}

export const ENDPOINT_CATALOG = [
  { id: 'fed-reg', name: 'US Federal Register API', agency: 'SEC & CFTC', jurisdiction: 'US Federal', protocol: 'REST JSON', auth: 'Public / None', ingests: true },
  { id: 'hkma-rss', name: 'HKMA RSS Feeds', agency: 'HKMA (Hong Kong)', jurisdiction: 'Hong Kong', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'fca-rss', name: 'UK FCA News RSS', agency: 'FCA (United Kingdom)', jurisdiction: 'United Kingdom', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'boe-pra', name: 'Bank of England PRA Publications RSS', agency: 'PRA (United Kingdom)', jurisdiction: 'United Kingdom', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'mas-gov', name: 'Singapore MAS News Search API', agency: 'MAS (Singapore)', jurisdiction: 'Singapore', protocol: 'JSON (undocumented)', auth: 'Public / None', ingests: true },
  { id: 'sfc-rss', name: 'SFC RSS Feeds', agency: 'SFC (Hong Kong)', jurisdiction: 'Hong Kong', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'hkex-rss', name: 'HKEX Regulatory Announcements RSS', agency: 'HKEX (Hong Kong)', jurisdiction: 'Hong Kong', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'esma-rss', name: 'ESMA News RSS', agency: 'ESMA (European Union)', jurisdiction: 'European Union', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'ec-ai', name: 'European Commission AI News', agency: 'European Commission (European Union)', jurisdiction: 'European Union', protocol: 'HTML (news list, AI topic)', auth: 'Public / None', ingests: true },
  { id: 'govuk-ai', name: 'GOV.UK Search API: DSIT & AI Security Institute', agency: 'DSIT & AI Security Institute (UK)', jurisdiction: 'United Kingdom', protocol: 'REST JSON (items on AI rules only)', auth: 'Public / None', ingests: true },
  { id: 'fedreg-ai', name: 'Federal Register API: AI documents', agency: 'US federal agencies', jurisdiction: 'US Federal', protocol: 'REST JSON (titles about AI only)', auth: 'Public / None', ingests: true },
  { id: 'ftc-rss', name: 'FTC Press Releases RSS', agency: 'FTC (United States)', jurisdiction: 'US Federal', protocol: 'RSS XML (items on AI rules or privacy only), read from a US region', auth: 'Public / None', ingests: true },
  { id: 'fedreg-ftc', name: 'Federal Register API: FTC documents', agency: 'FTC (United States)', jurisdiction: 'US Federal', protocol: 'REST JSON (documents on AI rules or privacy only)', auth: 'Public / None', ingests: true },
  { id: 'ca-gov', name: 'California Governor: site search feed', agency: 'Governor of California', jurisdiction: 'US · California', protocol: 'RSS XML (search for AI; items on AI rules only)', auth: 'Public / None', ingests: true },
  { id: 'calprivacy', name: 'CalPrivacy News RSS', agency: 'California Privacy Protection Agency', jurisdiction: 'US · California', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'co-ag', name: 'Colorado AG: site search feed', agency: 'Colorado Attorney General', jurisdiction: 'US · Colorado', protocol: 'RSS XML (search for AI; items on AI rules only)', auth: 'Public / None', ingests: true },
  { id: 'co-ag-ai', name: 'Colorado AG: AI rulemaking page', agency: 'Colorado Attorney General', jurisdiction: 'US · Colorado', protocol: 'JSON (WordPress page API; one notice per revision of the page)', auth: 'Public / None', ingests: true },
  { id: 'msit-kr', name: 'MSIT English Press Releases', agency: 'Ministry of Science and ICT (South Korea)', jurisdiction: 'South Korea', protocol: 'HTML (list data in page; items on AI rules only)', auth: 'Public / None', ingests: true },
  { id: 'govcn-ai', name: 'gov.cn Policy Library: AI', agency: 'State Council & its departments (China)', jurisdiction: 'China', protocol: 'JSON (policy library search, in Chinese; items on AI rules only)', auth: 'Public / None', ingests: true },
  { id: 'cao-ai', name: 'Cabinet Office AI Strategy Topics', agency: 'Cabinet Office (Japan)', jurisdiction: 'Japan', protocol: 'HTML (topics list, in Japanese)', auth: 'Public / None', ingests: true },
  { id: 'ico', name: 'ICO News, Blogs & Statements', agency: 'ICO (United Kingdom)', jurisdiction: 'United Kingdom', protocol: 'JSON (search service behind ICO news page)', auth: 'Public / None', ingests: true },
  { id: 'edpb', name: 'EDPB News RSS', agency: 'European Data Protection Board (European Union)', jurisdiction: 'European Union', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'pdpc', name: 'PDPC Media & Events', agency: 'PDPC (Singapore)', jurisdiction: 'Singapore', protocol: 'JSON (listing service behind PDPC page)', auth: 'Public / None', ingests: true },
  { id: 'jpdp', name: 'JPDP Announcements RSS', agency: 'Personal Data Protection Department (Malaysia)', jurisdiction: 'Malaysia', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'oaic', name: 'OAIC Media Centre', agency: 'OAIC (Australia)', jurisdiction: 'Australia', protocol: 'HTML (items on privacy only)', auth: 'Public / None', ingests: true },
  { id: 'ppc', name: 'PPC News', agency: 'Personal Information Protection Commission (Japan)', jurisdiction: 'Japan', protocol: 'HTML (news list, in Japanese)', auth: 'Public / None', ingests: true },
  { id: 'pipc', name: 'PIPC English Notices', agency: 'Personal Information Protection Commission (South Korea)', jurisdiction: 'South Korea', protocol: 'HTML', auth: 'Public / None', ingests: true },
  { id: 'govcn-privacy', name: 'gov.cn Policy Library: Personal Information', agency: 'State Council & its departments (China)', jurisdiction: 'China', protocol: 'JSON (policy library search, in Chinese; titles on personal information only)', auth: 'Public / None', ingests: true },
  { id: 'fsb-rss', name: 'FSB Publications RSS', agency: 'FSB (Global)', jurisdiction: 'Global', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'asic-gov', name: 'ASIC Media Releases', agency: 'ASIC (Australia)', jurisdiction: 'Australia', protocol: 'JSON (behind ASIC newsroom page)', auth: 'Public / None', ingests: true },
  { id: 'jfsa-rss', name: 'JFSA English News RSS', agency: 'JFSA (Japan)', jurisdiction: 'Japan', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'sgx-regco', name: 'SGX RegCo Content API', agency: 'SGX RegCo (Singapore)', jurisdiction: 'Singapore', protocol: 'JSON (behind SGX RegCo pages)', auth: 'Public / None', ingests: true },
  { id: 'asx-consult', name: 'ASX Public Consultations', agency: 'ASX (Australia)', jurisdiction: 'Australia', protocol: 'HTML', auth: 'Public / None', ingests: true },
  { id: 'jpx-rules', name: 'JPX Rule Revisions', agency: 'TSE, OSE, TOCOM, JPX-R (Japan)', jurisdiction: 'Japan', protocol: 'HTML', auth: 'Public / None', ingests: true },
  { id: 'bnm-rss', name: 'BNM Press Releases', agency: 'BNM (Malaysia)', jurisdiction: 'Malaysia', protocol: 'HTML', auth: 'Public / None', ingests: true },
  { id: 'sc-my', name: 'SC Malaysia Media Releases', agency: 'SC Malaysia', jurisdiction: 'Malaysia', protocol: 'HTML (list data in page)', auth: 'Public / None', ingests: true },
  { id: 'finra-rss', name: 'FINRA Notices RSS', agency: 'FINRA (United States)', jurisdiction: 'US', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'bafin-rss', name: 'BaFin English RSS Feeds', agency: 'BaFin (Germany)', jurisdiction: 'Germany', protocol: 'RSS XML (news; measures and sanctions)', auth: 'Public / None', ingests: true },
  { id: 'rbi-rss', name: 'RBI RSS Feeds', agency: 'Reserve Bank of India', jurisdiction: 'India', protocol: 'RSS XML (notifications; press releases)', auth: 'Public / None', ingests: true },
  { id: 'sebi-rss', name: 'SEBI RSS Feed', agency: 'SEBI (India)', jurisdiction: 'India', protocol: 'RSS XML', auth: 'Public / None', ingests: true },
  { id: 'bis-portal', name: 'BIS Media Releases RSS', agency: 'BIS & Basel Committee', jurisdiction: 'Global', protocol: 'RSS 1.0 (RDF)', auth: 'Public / None', ingests: true }
] as const satisfies readonly EndpointInfo[];

export type EndpointId = (typeof ENDPOINT_CATALOG)[number]['id'];

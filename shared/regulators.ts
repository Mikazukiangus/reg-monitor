// The regulators notices come from, each with a stable id. A notice's
// regulator is the short name a source gives it ("US SEC"); the id names the
// same body after that name changes, so the history can be grouped by it.
// Each id was made from the regulator's name in October 2026 (regulatorSlug);
// keep the id when renaming. A name not listed here gets the id made from it.
import type { JurisdictionCode } from './regulatory';

export interface Regulator {
  id: string;
  // The short name sources give it, as shown on notices
  name: string;
  fullName: string;
  jurisdictionCode: JurisdictionCode;
}

export const REGULATORS: readonly Regulator[] = [
  // Financial regulators, exchanges and standard setters
  { id: 'us-sec', name: 'US SEC', fullName: 'US Securities and Exchange Commission', jurisdictionCode: 'US' },
  { id: 'us-cftc', name: 'US CFTC', fullName: 'US Commodity Futures Trading Commission', jurisdictionCode: 'US' },
  { id: 'finra', name: 'FINRA', fullName: 'Financial Industry Regulatory Authority', jurisdictionCode: 'US' },
  { id: 'uk-fca', name: 'UK FCA', fullName: 'Financial Conduct Authority', jurisdictionCode: 'UK_EU' },
  { id: 'uk-pra', name: 'UK PRA', fullName: 'Prudential Regulation Authority (Bank of England)', jurisdictionCode: 'UK_EU' },
  { id: 'esma', name: 'ESMA', fullName: 'European Securities and Markets Authority', jurisdictionCode: 'UK_EU' },
  { id: 'hkma', name: 'HKMA', fullName: 'Hong Kong Monetary Authority', jurisdictionCode: 'HK' },
  { id: 'sfc', name: 'SFC', fullName: 'Securities and Futures Commission of Hong Kong', jurisdictionCode: 'HK' },
  { id: 'hkex', name: 'HKEX', fullName: 'Hong Kong Exchanges and Clearing', jurisdictionCode: 'HK' },
  { id: 'mas', name: 'MAS', fullName: 'Monetary Authority of Singapore', jurisdictionCode: 'SG' },
  { id: 'sgx-regco', name: 'SGX RegCo', fullName: 'Singapore Exchange Regulation', jurisdictionCode: 'SG' },
  { id: 'asic', name: 'ASIC', fullName: 'Australian Securities and Investments Commission', jurisdictionCode: 'AU' },
  { id: 'asx', name: 'ASX', fullName: 'Australian Securities Exchange', jurisdictionCode: 'AU' },
  { id: 'jfsa', name: 'JFSA', fullName: 'Financial Services Agency of Japan', jurisdictionCode: 'JP' },
  { id: 'tse', name: 'TSE', fullName: 'Tokyo Stock Exchange', jurisdictionCode: 'JP' },
  { id: 'ose', name: 'OSE', fullName: 'Osaka Exchange', jurisdictionCode: 'JP' },
  { id: 'tocom', name: 'TOCOM', fullName: 'Tokyo Commodity Exchange', jurisdictionCode: 'JP' },
  { id: 'jpx-r', name: 'JPX-R', fullName: 'Japan Exchange Regulation', jurisdictionCode: 'JP' },
  { id: 'bnm', name: 'BNM', fullName: 'Bank Negara Malaysia', jurisdictionCode: 'MY' },
  { id: 'sc-malaysia', name: 'SC Malaysia', fullName: 'Securities Commission Malaysia', jurisdictionCode: 'MY' },
  { id: 'fsb', name: 'FSB', fullName: 'Financial Stability Board', jurisdictionCode: 'GLOBAL' },
  { id: 'bis', name: 'BIS', fullName: 'Bank for International Settlements', jurisdictionCode: 'GLOBAL' },
  { id: 'bcbs', name: 'BCBS', fullName: 'Basel Committee on Banking Supervision', jurisdictionCode: 'GLOBAL' },

  // AI rules
  { id: 'european-commission', name: 'European Commission', fullName: 'European Commission', jurisdictionCode: 'UK_EU' },
  { id: 'uk-dsit', name: 'UK DSIT', fullName: 'Department for Science, Innovation and Technology', jurisdictionCode: 'UK_EU' },
  { id: 'uk-ai-security-institute', name: 'UK AI Security Institute', fullName: 'AI Security Institute', jurisdictionCode: 'UK_EU' },
  { id: 'us-president', name: 'US President', fullName: 'Executive Office of the President', jurisdictionCode: 'US' },
  { id: 'nist', name: 'NIST', fullName: 'National Institute of Standards and Technology', jurisdictionCode: 'US' },
  { id: 'us-ftc', name: 'US FTC', fullName: 'US Federal Trade Commission', jurisdictionCode: 'US' },
  { id: 'us-commerce-bis', name: 'US Commerce (BIS)', fullName: 'Bureau of Industry and Security, US Department of Commerce', jurisdictionCode: 'US' },
  { id: 'us-ostp', name: 'US OSTP', fullName: 'Office of Science and Technology Policy', jurisdictionCode: 'US' },
  { id: 'us-omb', name: 'US OMB', fullName: 'Office of Management and Budget', jurisdictionCode: 'US' },
  { id: 'us-federal-register', name: 'US Federal Register', fullName: 'US Federal Register (agency not given)', jurisdictionCode: 'US' },
  { id: 'california-governor', name: 'California Governor', fullName: 'Governor of California', jurisdictionCode: 'US' },
  { id: 'colorado-ag', name: 'Colorado AG', fullName: 'Colorado Attorney General', jurisdictionCode: 'US' },
  { id: 'msit', name: 'MSIT', fullName: 'Ministry of Science and ICT (South Korea)', jurisdictionCode: 'KR' },
  { id: 'cabinet-office', name: 'Cabinet Office', fullName: 'Cabinet Office of Japan', jurisdictionCode: 'JP' },
  { id: 'state-council', name: 'State Council', fullName: 'State Council of China', jurisdictionCode: 'CN' },
  { id: 'state-council-gazette', name: 'State Council Gazette', fullName: 'State Council Gazette (issuer not given)', jurisdictionCode: 'CN' },
  { id: 'cac', name: 'CAC', fullName: 'Cyberspace Administration of China', jurisdictionCode: 'CN' },
  { id: 'miit', name: 'MIIT', fullName: 'Ministry of Industry and Information Technology', jurisdictionCode: 'CN' },
  { id: 'ndrc', name: 'NDRC', fullName: 'National Development and Reform Commission', jurisdictionCode: 'CN' },
  { id: 'most', name: 'MOST', fullName: 'Ministry of Science and Technology of China', jurisdictionCode: 'CN' },
  { id: 'moe', name: 'MOE', fullName: 'Ministry of Education of China', jurisdictionCode: 'CN' },
  { id: 'mps', name: 'MPS', fullName: 'Ministry of Public Security of China', jurisdictionCode: 'CN' },
  { id: 'samr', name: 'SAMR', fullName: 'State Administration for Market Regulation', jurisdictionCode: 'CN' },
  { id: 'nda', name: 'NDA', fullName: 'National Data Administration', jurisdictionCode: 'CN' },
  { id: 'nhc', name: 'NHC', fullName: 'National Health Commission', jurisdictionCode: 'CN' },
  { id: 'nmpa', name: 'NMPA', fullName: 'National Medical Products Administration', jurisdictionCode: 'CN' },
  { id: 'cnipa', name: 'CNIPA', fullName: 'China National Intellectual Property Administration', jurisdictionCode: 'CN' },
  { id: 'cma', name: 'CMA', fullName: 'China Meteorological Administration', jurisdictionCode: 'CN' },
  { id: 'nrta', name: 'NRTA', fullName: 'National Radio and Television Administration', jurisdictionCode: 'CN' },
  { id: 'sac', name: 'SAC', fullName: 'Standardization Administration of China', jurisdictionCode: 'CN' },
  { id: 'mohrss', name: 'MOHRSS', fullName: 'Ministry of Human Resources and Social Security', jurisdictionCode: 'CN' },
  { id: 'mofcom', name: 'MOFCOM', fullName: 'Ministry of Commerce of China', jurisdictionCode: 'CN' },
  { id: 'caac', name: 'CAAC', fullName: 'Civil Aviation Administration of China', jurisdictionCode: 'CN' },
  { id: 'mca', name: 'MCA', fullName: 'Ministry of Civil Affairs of China', jurisdictionCode: 'CN' },
  { id: 'pboc', name: 'PBOC', fullName: "People's Bank of China", jurisdictionCode: 'CN' },
  { id: 'nfra', name: 'NFRA', fullName: 'National Financial Regulatory Administration', jurisdictionCode: 'CN' },
  { id: 'spb', name: 'SPB', fullName: 'State Post Bureau', jurisdictionCode: 'CN' },

  // Data protection authorities
  { id: 'ico', name: 'ICO', fullName: "Information Commissioner's Office", jurisdictionCode: 'UK_EU' },
  { id: 'edpb', name: 'EDPB', fullName: 'European Data Protection Board', jurisdictionCode: 'UK_EU' },
  { id: 'pdpc', name: 'PDPC', fullName: 'Personal Data Protection Commission (Singapore)', jurisdictionCode: 'SG' },
  { id: 'jpdp', name: 'JPDP', fullName: 'Personal Data Protection Department (Malaysia)', jurisdictionCode: 'MY' },
  { id: 'oaic', name: 'OAIC', fullName: 'Office of the Australian Information Commissioner', jurisdictionCode: 'AU' },
  { id: 'ppc', name: 'PPC', fullName: 'Personal Information Protection Commission (Japan)', jurisdictionCode: 'JP' },
  { id: 'pipc', name: 'PIPC', fullName: 'Personal Information Protection Commission (South Korea)', jurisdictionCode: 'KR' },
  { id: 'calprivacy-cppa', name: 'CalPrivacy (CPPA)', fullName: 'California Privacy Protection Agency', jurisdictionCode: 'US' }
];

const byName = new Map(REGULATORS.map(r => [r.name, r]));

// The id made from a name: lower case, runs of anything but a-z and 0-9 as one
// hyphen ("US Commerce (BIS)" -> "us-commerce-bis"). Migration 2 makes the
// same in SQL. A name with no such letters (a Chinese issuer the gov.cn source
// does not know) gives none.
export function regulatorSlug(name: string): string | undefined {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || undefined;
}

// The listed regulator with this name, if any
export const regulatorNamed = (name: string): Regulator | undefined => byName.get(name);

// A notice's regulator id: the listed one's, or the id made from the name
export const regulatorIdOf = (name: string): string | undefined => byName.get(name)?.id ?? regulatorSlug(name);

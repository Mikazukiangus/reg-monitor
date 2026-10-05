import { RegulatoryNotice, DeadlineItem, LatencyMetric, TrendBrief, AlertNotification, CustomAlertRule } from '../types/regulatory';

export const INITIAL_NOTICES: RegulatoryNotice[] = [
  {
    id: 'mas-dpt-2024',
    ref: 'Ref: MAS-FSG-2024-C08',
    title: 'Circular on Operational Resilience and Technology Risk Management for Digital Payment Token (DPT) Licensees',
    regulator: 'MAS',
    jurisdiction: 'SINGAPORE',
    jurisdictionCode: 'SG',
    type: 'MANDATORY CIRCULAR',
    typeColorClass: {
      bg: 'bg-[#FEE2E2]',
      text: 'text-[#B91C1C]'
    },
    impactScore: 9.4,
    issuedTimeAgo: '2 hours ago',
    statutoryDeadline: '30 Nov 2024',
    deadlineDate: '2024-11-30',
    statusBadge: {
      text: 'Statutory Deadline: 30 Nov 2024',
      type: 'deadline'
    },
    aiSynthesis: {
      title: 'AI Executive Legal Synthesis',
      points: [
        'Mandates 4-hour max RTO (Recovery Time Objective) for key fiat and stablecoin on-ramps, custodial hot wallets, and multi-sig clearance nodes.',
        'Requires independent SOC2 Type II or ISO 27001 statutory external third-party penetration audits to be filed directly with MAS quarterly.',
        'Senior Executive Accountability Regime (SEAR) linkage: Board-level Chief Information Security Officer (CISO) directly liable for unremediated zero-days exceeding 72h.'
      ]
    },
    impactedUnits: ['Custody Operations', 'Wealth Tech', 'OTC Trading'],
    tags: ['Operational Resilience', 'DPT Licensing', 'Technology Risk', 'CISO Liability'],
    sector: 'FinTech & Digital Assets',
    format: 'Circulars',
    severity: 'critical'
  },
  {
    id: 'hkma-sfc-tokenised-2024',
    ref: 'Ref: SFC/HKMA/2024/09-TK',
    title: "Joint Consultation Conclusions on Intermediaries' Virtual Asset Activities and Tokenised Securities Distribution",
    regulator: 'HKMA & SFC',
    jurisdiction: 'HONG KONG',
    jurisdictionCode: 'HK',
    type: 'FINAL GUIDANCE',
    typeColorClass: {
      bg: 'bg-[#DCFCE7]',
      text: 'text-[#15803D]'
    },
    impactScore: 8.8,
    issuedTimeAgo: '4 hours ago',
    statutoryDeadline: 'Effective Immediately',
    deadlineDate: '2024-10-05',
    statusBadge: {
      text: 'Effective Immediately',
      type: 'immediate'
    },
    summary: 'Removes retail professional-investor only restriction for primary secondary distribution of public tokenised debt securities under the SFO framework, subject to strict distributor due diligence, underlying smart contract independent code verification, and statutory client asset segregation in cold-storage vaults.',
    tags: ['Capital Markets', 'Tokenisation', 'Retail Access', 'Smart Contracts'],
    sector: 'FinTech & Digital Assets',
    format: 'Guidelines',
    severity: 'high'
  },
  {
    id: 'asic-greenwashing-2024',
    ref: 'Ref: ASIC-MR-24-188',
    title: 'Enforcement Direction on Greenwashing Disclosures in Wholesale & Institutional Fund Prospectuses',
    regulator: 'ASIC',
    jurisdiction: 'AUSTRALIA',
    jurisdictionCode: 'AU',
    type: 'ENFORCEMENT NOTICE',
    typeColorClass: {
      bg: 'bg-[#FEF2F2]',
      text: 'text-[#DC2626]'
    },
    impactScore: 8.1,
    issuedTimeAgo: '6 hours ago',
    statutoryDeadline: 'Civil Penalty Proceedings Initiated',
    statusBadge: {
      text: 'Civil Penalty Proceedings Initiated',
      type: 'action'
    },
    summary: 'Federal Court civil penalty actions announced against 2 multi-asset asset managers for misrepresenting Scope 3 emission reduction targets in Product Disclosure Statements (PDS). Mandatory remediation order issued across all Australian Financial Services (AFS) licensees utilizing third-party ESG scoring engines without verifiable methodology audit trails.',
    tags: ['ESG Disclosures', 'Asset Management', 'Litigation Precedent', 'Scope 3'],
    sector: 'ESG & Sustainability',
    format: 'Enforcement',
    severity: 'high'
  },
  {
    id: 'jfsa-hft-2024',
    ref: 'Ref: FSA-CP-2024-FIEA',
    title: 'Draft Amendments to the Financial Instruments and Exchange Act regarding High-Frequency Algorithmic Reporting',
    regulator: 'JFSA',
    jurisdiction: 'JAPAN',
    jurisdictionCode: 'JP',
    type: 'CONSULTATION PAPER',
    typeColorClass: {
      bg: 'bg-[#EDE9FE]',
      text: 'text-[#6D28D9]'
    },
    impactScore: 7.6,
    issuedTimeAgo: '10 hours ago',
    statutoryDeadline: 'Open until 15 Dec 2024',
    deadlineDate: '2024-12-15',
    statusBadge: {
      text: 'Open until 15 Dec 2024',
      type: 'deadline'
    },
    summary: 'Proposes expanded mandatory intraday order-to-trade ratio disclosures for foreign high-frequency trading (HFT) participants registered with the Kanto Local Finance Bureau, introducing automated trade halts during Tokyo Stock Exchange derivatives volatility spikes.',
    tags: ['Algorithmic Trading', 'Market Microstructure', 'HFT Disclosures'],
    sector: 'Banking & Capital Markets',
    format: 'Consultations',
    severity: 'high'
  },
  {
    id: 'uk-fca-emir-apac-2024',
    ref: 'Ref: EMIR-APAC-2024-X',
    title: 'Interoperability & Equivalence Protocol for Cross-Border APAC OTC Derivatives Central Clearing',
    regulator: 'UK FCA & ESMA',
    jurisdiction: 'CROSS-BORDER',
    jurisdictionCode: 'UK_EU',
    type: 'TECHNICAL STANDARD',
    typeColorClass: {
      bg: 'bg-[#F5F1E8]',
      text: 'text-[#57534E]'
    },
    impactScore: 6.9,
    issuedTimeAgo: '14 hours ago',
    statutoryDeadline: 'Standard EMIR Equivalence',
    statusBadge: {
      text: 'Standard EMIR Equivalence',
      type: 'standard'
    },
    summary: 'Mutual recognition confirmed for qualifying central counterparties (QCCPs) between SGX (Singapore) and ASX (Sydney) with ESMA, preventing dual-margin capital adequacy surcharges under Basel III output floors.',
    tags: ['Derivatives', 'Clearing Houses', 'Basel III', 'QCCP'],
    sector: 'Banking & Capital Markets',
    format: 'Technical Standards',
    severity: 'info'
  },
  {
    id: 'hkma-ai-governance-2024',
    ref: 'Ref: HKMA/CIR/2024/11-AI',
    title: 'Supervisory Policy Manual (SPM) on Generative AI and Algorithmic Credit Decisioning in Retail Banking',
    regulator: 'HKMA',
    jurisdiction: 'HONG KONG',
    jurisdictionCode: 'HK',
    type: 'CONSULTATION PAPER',
    typeColorClass: {
      bg: 'bg-[#EDE9FE]',
      text: 'text-[#6D28D9]'
    },
    impactScore: 8.5,
    issuedTimeAgo: '16 hours ago',
    statutoryDeadline: 'Open until 20 Jan 2025',
    deadlineDate: '2025-01-20',
    statusBadge: {
      text: 'Open until 20 Jan 2025',
      type: 'deadline'
    },
    aiSynthesis: {
      title: 'AI Governance Model Risk Provisions',
      points: [
        'Mandates human-in-the-loop review for all adverse retail lending and credit limit reductions driven by automated LLM decision systems.',
        'Requires authorized institutions (AIs) to maintain dynamic training data provenance audits to prevent synthetic hallucinations in AML sanctions screening.',
        'Independent model validation audits must be conducted prior to commercial rollout for any foundational model with parameter scale > 7B.'
      ]
    },
    impactedUnits: ['Retail Risk', 'AI Engineering', 'Compliance Tech'],
    tags: ['AI Governance', 'Model Risk', 'Generative AI', 'Credit Risk'],
    sector: 'AI Governance & Ethics',
    format: 'Consultations',
    severity: 'high'
  },
  {
    id: 'mas-aml-cft-crossborder-2024',
    ref: 'Ref: MAS-AML-NOT-2024-03',
    title: 'Notice on Prevention of Money Laundering and Countering the Financing of Terrorism for Wealth Managers',
    regulator: 'MAS',
    jurisdiction: 'SINGAPORE',
    jurisdictionCode: 'SG',
    type: 'MANDATORY CIRCULAR',
    typeColorClass: {
      bg: 'bg-[#FEE2E2]',
      text: 'text-[#B91C1C]'
    },
    impactScore: 9.1,
    issuedTimeAgo: '18 hours ago',
    statutoryDeadline: 'Statutory Deadline: 15 Jan 2025',
    deadlineDate: '2025-01-15',
    statusBadge: {
      text: 'Statutory Deadline: 15 Jan 2025',
      type: 'deadline'
    },
    summary: 'Stricter source-of-wealth evidentiary requirements mandated for Single Family Offices (SFOs) enjoying tax incentive schemes under Section 13O and 13U. Financial institutions must implement real-time beneficial ownership verification against international PEP registries.',
    tags: ['AML/CFT', 'Single Family Offices', 'Wealth Management', 'PEP Screening'],
    sector: 'AML/CFT & Sanctions',
    format: 'Circulars',
    severity: 'critical'
  },
  {
    id: 'sec-cftc-apac-swap-2024',
    ref: 'Ref: SEC-REL-34-99801',
    title: 'Exemptive Order Concerning Cross-Border Security-Based Swap Execution Facilities with Singapore and Tokyo',
    regulator: 'US SEC & CFTC',
    jurisdiction: 'UNITED STATES',
    jurisdictionCode: 'US',
    type: 'FINAL GUIDANCE',
    typeColorClass: {
      bg: 'bg-[#DCFCE7]',
      text: 'text-[#15803D]'
    },
    impactScore: 6.8,
    issuedTimeAgo: '1 day ago',
    statutoryDeadline: 'Effective Immediately',
    deadlineDate: '2024-10-04',
    statusBadge: {
      text: 'Effective Immediately',
      type: 'immediate'
    },
    summary: 'Clarifies substituted compliance standards for foreign market participants trading security-based swaps through recognized trading venues in Singapore (MAS) and Japan (JFSA), harmonizing uncleared swap margin requirements.',
    tags: ['Swap Execution', 'Cross-Border', 'Dodd-Frank', 'Margin Rules'],
    sector: 'Banking & Capital Markets',
    format: 'Guidelines',
    severity: 'info'
  },
  {
    id: 'asic-corp-governance-2024',
    ref: 'Ref: ASIC-CP-390',
    title: 'Consultation on Climate-Related Financial Disclosures: Mandatory Australian Sustainability Reporting Standards',
    regulator: 'ASIC',
    jurisdiction: 'AUSTRALIA',
    jurisdictionCode: 'AU',
    type: 'CONSULTATION PAPER',
    typeColorClass: {
      bg: 'bg-[#EDE9FE]',
      text: 'text-[#6D28D9]'
    },
    impactScore: 8.6,
    issuedTimeAgo: '1 day ago',
    statutoryDeadline: 'Open until 28 Feb 2025',
    deadlineDate: '2025-02-28',
    statusBadge: {
      text: 'Open until 28 Feb 2025',
      type: 'deadline'
    },
    summary: 'Defines phase-in timetables for Group 1 entities ($500M+ revenue) to provide verified Scope 1, 2 and 3 emissions reports, climate scenario stress tests, and director climate competency declarations in annual statutory financial reports.',
    tags: ['Climate Disclosures', 'ASRS', 'Scope 3', 'Corporate Governance'],
    sector: 'ESG & Sustainability',
    format: 'Consultations',
    severity: 'high'
  },
  {
    id: 'jfsa-crypto-tax-2024',
    ref: 'Ref: JFSA-CIRC-2024-88',
    title: 'Supervisory Guidelines for Crypto-Asset Exchange Service Providers (CAESPs) Regarding Segregated Reserve Ratios',
    regulator: 'JFSA',
    jurisdiction: 'JAPAN',
    jurisdictionCode: 'JP',
    type: 'MANDATORY CIRCULAR',
    typeColorClass: {
      bg: 'bg-[#FEE2E2]',
      text: 'text-[#B91C1C]'
    },
    impactScore: 9.0,
    issuedTimeAgo: '1 day ago',
    statutoryDeadline: 'Statutory Deadline: 31 Dec 2024',
    deadlineDate: '2024-12-31',
    statusBadge: {
      text: 'Statutory Deadline: 31 Dec 2024',
      type: 'deadline'
    },
    summary: 'Requires CAESPs in Japan to hold at least 95% of customer digital assets in non-network connected cold storage, with statutory capital reserves equal to 100% of any hot-wallet float to protect against cybersecurity compromise.',
    tags: ['Cold Storage', 'CAESP', 'Reserve Ratios', 'Cybersecurity'],
    sector: 'FinTech & Digital Assets',
    format: 'Circulars',
    severity: 'critical'
  }
];

export const DEADLINES: DeadlineItem[] = [
  {
    id: 'd1',
    title: 'MAS DPT Circular',
    subtitle: 'Gap Analysis sign-off',
    daysRemaining: 12,
    dateStr: '30 Nov',
    colorClass: 'text-[#DC2626]',
    textColorClass: 'text-[#DC2626]',
    noticeId: 'mas-dpt-2024'
  },
  {
    id: 'd2',
    title: 'JFSA Algo Consultation',
    subtitle: 'Public Comments Due',
    daysRemaining: 27,
    dateStr: '15 Dec',
    colorClass: 'text-[#0D5C63]',
    textColorClass: 'text-[#0D5C63]',
    noticeId: 'jfsa-hft-2024'
  },
  {
    id: 'd3',
    title: 'HKMA Stablecoin Sandbox',
    subtitle: 'Cohort 2 Submissions',
    daysRemaining: 45,
    dateStr: '31 Dec',
    colorClass: 'text-[#1E1B18]',
    textColorClass: 'text-[#1E1B18]',
    noticeId: 'hkma-sfc-tokenised-2024'
  },
  {
    id: 'd4',
    title: 'MAS SFO AML Overhaul',
    subtitle: 'Beneficial Owner Audit',
    daysRemaining: 60,
    dateStr: '15 Jan',
    colorClass: 'text-[#0D5C63]',
    textColorClass: 'text-[#0D5C63]',
    noticeId: 'mas-aml-cft-crossborder-2024'
  },
  {
    id: 'd5',
    title: 'ASIC Scope 3 Disclosure',
    subtitle: 'Phase 1 Working Group',
    daysRemaining: 104,
    dateStr: '28 Feb',
    colorClass: 'text-[#15803D]',
    textColorClass: 'text-[#15803D]',
    noticeId: 'asic-corp-governance-2024'
  }
];

export const LATENCY_METRICS: LatencyMetric[] = [
  { jurisdiction: 'Singapore', agency: 'MAS (Singapore)', pingMs: 12, status: 'Operational' },
  { jurisdiction: 'Hong Kong', agency: 'HKMA/SFC (Hong Kong)', pingMs: 14, status: 'Operational' },
  { jurisdiction: 'Australia', agency: 'ASIC (Australia)', pingMs: 28, status: 'Operational' },
  { jurisdiction: 'Japan', agency: 'JFSA (Japan)', pingMs: 32, status: 'Operational' }
];

export const TREND_BRIEFS: TrendBrief[] = [
  {
    id: 't1',
    tag: 'Trend 1: Dual-Licensing Squeeze',
    title: 'MAS & HKMA Operational Risk Harmonisation',
    summary: 'MAS & HKMA are synchronizing operational risk thresholds for custodial digital assets. Entities with dual Singapore/HK licenses face harmonized audit disclosures starting Q4.',
    severityColor: 'text-[#0D5C63]',
    jurisdictions: ['MAS', 'HKMA']
  },
  {
    id: 't2',
    tag: 'Trend 2: Greenwashing Liability',
    title: 'Federal Enforcement vs Wholesale Safe-Harbors',
    summary: "ASIC's enforcement signals wholesale ESG safe-harbor clauses are obsolete. Global cross-border syndicates must reconcile Aussie disclosures with EU SFDR Article 8/9 classifications.",
    severityColor: 'text-[#DC2626]',
    jurisdictions: ['ASIC', 'ESMA']
  },
  {
    id: 't3',
    tag: 'Trend 3: Algorithmic Microstructure Volatility',
    title: 'Tokyo & Singapore Coordinated Flash-Halt Standards',
    summary: 'JFSA and SGX are aligning circuit breaker parameters on algorithmic HFT order flows to curb contagion during cross-asset volatility spikes across Nikkei and STI futures.',
    severityColor: 'text-[#15803D]',
    jurisdictions: ['JFSA', 'MAS']
  }
];

export const INITIAL_NOTIFICATIONS: AlertNotification[] = [
  {
    id: 'notif-1',
    title: 'MAS issued Mandatory Circular MAS-FSG-2024-C08 (DPT Resilience)',
    regulator: 'MAS Singapore',
    time: '2h ago',
    severity: 'critical',
    unread: true,
    linkId: 'mas-dpt-2024'
  },
  {
    id: 'notif-2',
    title: 'ASIC Federal Court action on Scope 3 Greenwashing in Prospectuses',
    regulator: 'ASIC Australia',
    time: '6h ago',
    severity: 'high',
    unread: true,
    linkId: 'asic-greenwashing-2024'
  },
  {
    id: 'notif-3',
    title: 'JFSA Consultation open on High-Frequency Order-to-Trade Ratios',
    regulator: 'JFSA Japan',
    time: '10h ago',
    severity: 'info',
    unread: true,
    linkId: 'jfsa-hft-2024'
  }
];

export const INITIAL_ALERT_RULES: CustomAlertRule[] = [
  {
    id: 'rule-1',
    name: 'Critical Mandates & Statutory Deadlines',
    jurisdictions: ['MAS', 'HKMA', 'ASIC'],
    minImpact: 8.5,
    keywords: ['Penalties', 'CISO', 'RTO', 'Custody', 'Mandatory'],
    channels: ['slack', 'webhook', 'email'],
    enabled: true,
    triggerCount: 14
  },
  {
    id: 'rule-2',
    name: 'Digital Assets & Tokenised Securities',
    jurisdictions: ['MAS', 'HKMA', 'JFSA'],
    minImpact: 7.0,
    keywords: ['DPT', 'Virtual Asset', 'Stablecoin', 'Tokenised', 'Cold Storage'],
    channels: ['slack', 'webhook'],
    enabled: true,
    triggerCount: 29
  },
  {
    id: 'rule-3',
    name: 'ESG & Greenwashing Enforcement Precedents',
    jurisdictions: ['ASIC', 'UK_EU', 'US'],
    minImpact: 7.5,
    keywords: ['Greenwashing', 'Scope 3', 'PDS', 'Disclosures', 'ASRS'],
    channels: ['slack', 'email'],
    enabled: true,
    triggerCount: 8
  }
];

export const RADAR_MATRIX = [
  {
    domain: 'FinTech & Digital Assets',
    mas: { level: 'Strict Mandate', desc: '4h RTO, CISO SEAR liability, Cold-storage split', color: 'text-red-700 bg-red-50 border-red-200' },
    hkma: { level: 'Retail Expansion', desc: 'Tokenised bond retail distribution unlocked', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    asic: { level: 'Product Monitoring', desc: 'Unlicensed crypto yield enforcement', color: 'text-[#0D5C63] bg-[#E6F4F4] border-[#B2DFDB]' },
    jfsa: { level: 'Reserve Mandate', desc: '95% cold storage, 100% hot float backed', color: 'text-red-700 bg-red-50 border-red-200' }
  },
  {
    domain: 'Banking & Capital Markets',
    mas: { level: 'Equivalence', desc: 'SGX QCCP mutual recognition with ESMA', color: 'text-blue-700 bg-blue-50 border-blue-200' },
    hkma: { level: 'Stablecoin Sandbox', desc: 'Cohort 2 sandbox issuer testing', color: 'text-blue-700 bg-blue-50 border-blue-200' },
    asic: { level: 'Market Microstructure', desc: 'High-frequency order cancellation caps', color: 'text-[#0D5C63] bg-[#E6F4F4] border-[#B2DFDB]' },
    jfsa: { level: 'Order-to-Trade', desc: 'Mandatory intraday ratios for foreign HFT', color: 'text-purple-700 bg-purple-50 border-purple-200' }
  },
  {
    domain: 'ESG & Climate Disclosures',
    mas: { level: 'Phased IFRS S1/S2', desc: 'Listed issuers mandatory FY25', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    hkma: { level: 'Climate Risk SPM', desc: 'Portfolio stress test disclosures', color: 'text-blue-700 bg-blue-50 border-blue-200' },
    asic: { level: 'Civil Penalties', desc: 'Scope 3 enforcement actions initiated', color: 'text-red-700 bg-red-50 border-red-200' },
    jfsa: { level: 'Code of Conduct', desc: 'ESG rating agencies voluntary framework', color: 'text-stone-700 bg-stone-100 border-stone-200' }
  },
  {
    domain: 'AI Governance & Ethics',
    mas: { level: 'FEAT Principles', desc: 'Veritas toolkit validation benchmark', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    hkma: { level: 'SPM Consultation', desc: 'Human-in-the-loop credit & model risk', color: 'text-purple-700 bg-purple-50 border-purple-200' },
    asic: { level: 'Algorithmic Duty', desc: 'Directors responsible for AI output harms', color: 'text-[#0D5C63] bg-[#E6F4F4] border-[#B2DFDB]' },
    jfsa: { level: 'Governance Study', desc: 'Joint panel with METI on GenAI trading', color: 'text-blue-700 bg-blue-50 border-blue-200' }
  },
  {
    domain: 'AML / CFT & Sanctions',
    mas: { level: 'SFO Overhaul', desc: 'S13O/U family office PEP verification', color: 'text-red-700 bg-red-50 border-red-200' },
    hkma: { level: 'AMLO Licensing', desc: 'Virtual asset service provider registration', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
    asic: { level: 'Austrac Alignment', desc: 'Remittance and bullion dealer reporting', color: 'text-[#0D5C63] bg-[#E6F4F4] border-[#B2DFDB]' },
    jfsa: { level: 'FATF Follow-up', desc: 'Travel rule strict API interoperability', color: 'text-[#0D5C63] bg-[#E6F4F4] border-[#B2DFDB]' }
  }
];

export const ENFORCEMENT_RECORDS = [
  {
    id: 'enf-1',
    ref: 'ASIC-MR-24-188',
    regulator: 'ASIC',
    entity: 'Pacific Crest Asset Management & Aurora Funds Ltd',
    penalty: 'AUD $14.2M sought in Federal Court',
    actionType: 'Civil Penalty & Remediation Order',
    category: 'Greenwashing / Misleading Scope 3 PDS',
    date: '2024-10-04',
    status: 'In Proceedings',
    summary: 'Alleged misleading representations regarding carbon neutral portfolios and third-party scoring methodologies without independent primary verification.'
  },
  {
    id: 'enf-2',
    ref: 'MAS-ENF-2024-09',
    entity: 'Zenith Prime Capital Pte Ltd (CMS Licensee)',
    regulator: 'MAS',
    penalty: 'SGD $3.8M Fine & Prohibition Orders',
    actionType: 'Statutory Fine & 5-Year Ban',
    category: 'AML/CFT & Unverified SFO Inflows',
    date: '2024-09-22',
    status: 'Concluded',
    summary: 'Failure to perform customer due diligence on high net-worth individuals holding complex offshore trust structures.'
  },
  {
    id: 'enf-3',
    ref: 'SFC-ENF-2024-04',
    entity: 'Apex Global Markets Hong Kong Ltd',
    regulator: 'HKMA & SFC',
    penalty: 'HKD $21.5M Reprimand & Fine',
    actionType: 'Regulatory Reprimand',
    category: 'Electronic Trading System Outage',
    date: '2024-08-30',
    status: 'Concluded',
    summary: 'System resilience breakdown during extreme Hang Seng index volatility causing 90-minute client execution freeze without backup failover.'
  },
  {
    id: 'enf-4',
    ref: 'FSA-ENF-2024-12',
    entity: 'Nippon Algorithmic Arbitrage KK',
    regulator: 'JFSA',
    penalty: 'JPY 450M Administrative Surcharge',
    actionType: 'Business Improvement Order',
    category: 'Spoofing & Algorithmic Market Manipulation',
    date: '2024-08-15',
    status: 'Under Remediation',
    summary: 'Submitting layered fictitious orders on Tokyo Stock Exchange Topix futures to induce artificial market movements.'
  }
];

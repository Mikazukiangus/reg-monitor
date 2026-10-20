// Tagging quality: real notice titles labelled by hand with the sector a
// reader would expect, and the format. When a rule changes, every example must
// still come out right; a new mistake seen on the site should be added here
// before the rule is fixed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySectors, classifyFormat } from '../shared/tagging.ts';
import type { SectorDomain } from '../shared/regulatory.ts';

const BANK: SectorDomain = 'Banking & Prudential';
const CAPM: SectorDomain = 'Capital Markets & Listings';
const FUND: SectorDomain = 'Funds & Asset Management';
const INSU: SectorDomain = 'Insurance & Pensions';
const FINT: SectorDomain = 'FinTech, Payments & Digital Assets';
const TECH: SectorDomain = 'AI, Cyber & Tech Risk';
const PRIV: SectorDomain = 'Data Privacy & Protection';
const ESG: SectorDomain = 'ESG & Sustainability';
const AML: SectorDomain = 'AML/CFT & Financial Crime';
const COND: SectorDomain = 'Conduct & Consumer Protection';
const MONE: SectorDomain = 'Monetary & Financial Stability';
const GEN: SectorDomain = 'General & Institutional';

// [title, regulator, main sector, sectors it must not have]. Where a notice is
// equally about two topics, either may be main and both must be given.
const SECTOR_EXAMPLES: [string, string, SectorDomain | SectorDomain[], SectorDomain[]?][] = [
  // AI only for AI ("retail", "maintain", "Thailand" are not)
  ['MAS Sets Out Supervisory Expectations on Responsible AI Adoption by Financial Institutions', 'MAS', TECH],
  ['Guidelines on Artificial Intelligence Risk Management for Financial Institutions', 'MAS', TECH],
  ['SFC to proceed with enhancements to Hong Kong’s retail fund regime code', 'SFC', FUND, [TECH]],
  ['Consultation Paper on Proposed Amendments to the Code on Collective Investment Schemes to Facilitate Retail Funds', 'MAS', FUND, [TECH]],
  ['Monetary Authority of Singapore and Bank of Thailand Sign Memorandum of Understanding on Cybersecurity Cooperation', 'MAS', TECH, [BANK]],
  ['Granting of restricted banking licence to BAKAI BANK Open Joint Stock Company', 'HKMA', BANK, [TECH]],
  ['Banking industry further extends loan repayment grace period for affected individuals of Tai Po Fire', 'HKMA', BANK, [TECH]],
  ['ASIC sues Osama Saad alleging conflicted remuneration avoidance schemes and advice failures', 'ASIC', COND, [TECH]],
  ['FSB Chair warns of risks arising from frontier Artificial Intelligence (AI) models', 'FSB', TECH],
  ['Supporting Adoption of Artificial Intelligence in Fighting Financial Crime', 'HKMA', [TECH, AML]],
  ['Strengthening Cyber Resilience amid Artificial Intelligence-Empowered Cyber Threats', 'HKMA', TECH],
  ['ASIC strengthens AI trading safeguards and streamlines market integrity rules', 'ASIC', [TECH, CAPM], [AML]],
  // AML only for financial crime ("streamlines", "Malaysia" are not)
  ['SGX RegCo streamlines ETF designated market-maker requirements', 'SGX RegCo', CAPM, [AML]],
  ['SFC, Securities Commission Malaysia announce Single Submission Arrangement to streamline simultaneous listings', 'SFC', CAPM, [AML]],
  ['Samlit Moneychanger Pte. Ltd., its Director and Compliance Manager to be Charged for Offences Under the Financial Services and Markets Act', 'MAS', AML, [CAPM]],
  ['Guidance on risk-based AML/CFT controls for politically exposed persons', 'HKMA', AML],
  ['Circular on Risk-Proportionate Source of Wealth Establishment', 'MAS', AML],
  ['Queensland property developer sentenced to 9 years imprisonment for fraud', 'ASIC', AML],
  ['Former financial services provider employee Emre Basar charged with misappropriation of client funds after ASIC investigation', 'ASIC', AML],
  ['SFC shares updates with securities industry on scam prevention and cybersecurity', 'SFC', [TECH, AML]],
  // ESG only for sustainability, not company names
  ['Announcement - In relation to the matter of Greentech Technology International Limited (Incorporated in the Cayman Islands)', 'HKEX', CAPM, [ESG]],
  ['SGX-ST Listings Disciplinary Committee reprimands former Executive Director of Yamada Green Resources Limited', 'SGX RegCo', CAPM, [ESG]],
  // A topic comes before the industry it applies to
  ['Guidelines on Environmental Risk Management for Banks', 'MAS', ESG],
  ['Guidelines on Environmental Risk Management for Asset Managers', 'MAS', ESG],
  ['Guidelines on Environmental Risk Management for Insurers', 'MAS', ESG],
  ['ID 04/26 Issuance of Guidelines on Transition Planning (Insurers)', 'MAS', ESG],
  ['GS-2 Transition Planning', 'HKMA', ESG],
  ['Consultation on Phase 2B prototype of Hong Kong Taxonomy for Sustainable Finance', 'HKMA', ESG, [TECH]],
  ['HKSAR Government’s Fourth Digital Green Bonds Offering', 'HKMA', ESG],
  ['ASIC observes improved sustainability reporting and notes areas for further development', 'ASIC', ESG],
  ['Consultation Paper on Climate and Diversity', 'SGX RegCo', ESG],
  ['Monetary Authority of Singapore and People’s Bank of China Strengthen Cooperation in Transition and Adaptation Finance', 'MAS', ESG, [BANK]],
  // FinTech, payments and digital assets
  ['MAS Consults on Legislative Amendments to Implement Stablecoin Regulatory Framework', 'MAS', FINT],
  ['Consultation on Proposed Amendments to the Payment Services Act 2019 for Stablecoins Regulation', 'MAS', FINT],
  ['FSTB and SFC conclude consultations on virtual asset advisory and management regimes', 'SFC', FINT],
  ['ESMA calls for changes to make MiCA clearer, safer and ready for emerging services', 'ESMA', FINT],
  ['Guidelines on Audit of Payment Service Providers [PS-G04]', 'MAS', FINT],
  ['Statistics of Stored Value Facilities (SVF) Schemes Issued by SVF Licensees', 'HKMA', FINT],
  ['Project Agorá shows how tokenisation can improve wholesale cross-border payments', 'BIS', FINT],
  ['MAS Commits S$220 Million to Support Next Phase of FinTech Innovation', 'MAS', FINT],
  ['Hong Kong Monetary Authority and Bank Indonesia Strengthen Cooperation in Cross-Border Payments', 'HKMA', FINT, [BANK]],
  ['SGX custody structure enhancements to take effect from July, board lot reduction in October', 'SGX RegCo', CAPM, [FINT]],
  ['Consultation Paper on Modernisation of Singapore’s Post-Trade Custody Model', 'SGX RegCo', CAPM, [FINT]],
  // Banking and prudential
  ['Guidelines on Liquidity Risk Management (Banks)', 'MAS', BANK],
  ['Consultation Paper on Proposed Total Loss Absorbing Capacity Requirements for Domestic Systemically Important Banks', 'MAS', BANK],
  ['Proposed amendments to the Banking (Capital) Rules', 'HKMA', BANK],
  ['IRRBB: consultation on revised SPM IR-1 Interest Rate Risk in the Banking Book', 'HKMA', BANK],
  ['Basel III applicable in almost all member jurisdictions by 2027', 'BIS', BANK],
  ['Letter from David Bailey \'Thematic feedback on accounting for IFRS 9 expected credit losses (ECL)\'', 'UK PRA', BANK],
  ['CP10/26 – Ring-fenced bodies: Changes to the continuity of provision of services rules', 'UK PRA', BANK],
  ['Residential Mortgage Survey Results for August 2026', 'HKMA', BANK],
  ['Cryptoasset Standard: consultation on revised SPM module CA-G-1 “Overview of Capital Adequacy Regime”', 'HKMA', BANK],
  // Insurance
  ['CP11/26 – A tailored regime for captive insurance', 'UK PRA', INSU],
  ['PS18/26 – Solvency UK: Post-implementation reporting and disclosure amendments and Own Funds permissions updates', 'UK PRA', INSU, [FUND, BANK]],
  ['MAS Consults on Protected Cell Company Framework to Support Growth of Alternative Risk Transfer Solutions in Insurance', 'MAS', INSU],
  ['ID 01/26 MAS Notice 126 - Lapses in Own Risk and Solvency Assessment (ORSA) Report Submissions', 'MAS', INSU],
  // Funds
  ['MAS Introduces Measures to Strengthen Singapore’s Competitiveness as a Leading Asset Management Hub', 'MAS', FUND],
  ['Circular on SFC-authorised funds with exposure to private market assets', 'SFC', FUND],
  ['ASIC halts offers of private credit products offered under Remara Cash Management Fund', 'ASIC', FUND],
  ['Exchange Fund Abridged Balance Sheet and Currency Board Account', 'HKMA', MONE, [FUND]],
  ['Consultation Paper on proposed changes to CDP margining and Clearing Fund', 'SGX RegCo', CAPM, [FUND]],
  ['Revisions to Rules Concerning Securities in Lieu of Cash for Guarantee Funds and Trading Participant Security Money', 'JPX-R', CAPM, [FUND]],
  // Capital markets and listings
  ['Exchange’s Disciplinary Action against Six Directors of Huisen Shares Group Limited (Stock Code: 2127)', 'HKEX', CAPM],
  ['Consultation Paper on Introduction of New SGX Global Listing Board', 'SGX RegCo', CAPM],
  ['SFC and HKMA jointly consult on standard calculation periods under OTC derivative Clearing Rules', 'SFC', CAPM],
  ['Roadmap for Implementing the Hong Kong Investor Identification Regime for the Exchange-traded Derivatives Market', 'SFC', CAPM, [AML]],
  ['Former Big Un CEO Richard Evans sentenced for communicating inside information', 'ASIC', CAPM],
  ['Trends in High-Speed Trading (as of the end of June 2026)', 'JFSA', CAPM],
  ['Upcoming changes to the Euribor Panel', 'ESMA', CAPM],
  ['Consultation Paper on Proposed Change to Share Financing Requirement', 'MAS', CAPM],
  ['Consultation Paper on Consolidation of Listing Suitability and Prospectus Review Functions', 'MAS', CAPM, [COND]],
  ['Consultation Paper on Board Renewal and Remuneration Disclosures', 'SGX RegCo', CAPM, [COND]],
  ['ASX released a consultation paper titled ASX Clear Third Party Clearing Capital Requirements and Other Proposed Changes', 'ASX', CAPM],
  ['Self-Regulatory Organizations; Cboe BZX Exchange, Inc.; Notice of Filing and Immediate Effectiveness of a Proposed Rule Change', 'US SEC', CAPM],
  ['Revisions to Securities Listing Regulations and Other Related Rules in Relation to Merger of Investment Trusts with Different Advisers', 'TSE', CAPM, [COND]],
  // Conduct and consumer protection
  ['Complaints Watch Issue No. 28', 'HKMA', COND],
  ['Consultation Paper on Enhancements to Product Highlights Sheet (PHS) Requirements and the Complex Products Framework', 'MAS', COND],
  ['ASIC sues lead generation business over alleged misleading comparison claims', 'ASIC', COND],
  ['Fundo Loans pays $19,800 infringement notice over ‘no credit check loans’ claim', 'ASIC', COND],
  ['Regulatory Notice 26-14: FINRA seeks comment on a proposal to modernize Rule 2210 (Communications with the Public)', 'FINRA', COND],
  ['ASIC takes action to protect investors in Star Investment Group Australia scheme', 'ASIC', COND],
  // Monetary and financial stability
  ['Hong Kong’s Latest Foreign Currency Reserve Assets Figures Released', 'HKMA', MONE],
  ['HKMA Half-Yearly Monetary and Financial Stability Report (September 2026 Issue)', 'HKMA', MONE],
  ['Result of the tender of the People\'s Bank of China RMB Bills held on 23 September 2026', 'HKMA', MONE, [BANK]],
  ['31st Executives’ Meeting of East Asia-Pacific Central Banks (EMEAP) Governors’ Meeting', 'MAS', MONE, [BANK]],
  ['Global economic pressure points call for policy discipline: BIS', 'BIS', MONE],
  ['Bank Indonesia and the Monetary Authority of Singapore Operationalise Local Currency Transaction Framework', 'MAS', MONE, [BANK]],
  // General: no topic, so no guessed sector
  ['MAS Announces Senior Leadership Changes', 'MAS', GEN],
  ['PRA Regulatory Digest – September 2026', 'UK PRA', BANK],
  ['Multilateralism, Utopia, and the Financial Stability Board', 'FSB', GEN, [MONE]],
  ['Ayman M. Al-Sayari appointed FSB’s Regional Engagement Chair', 'FSB', GEN],
  ['Licence Fees', 'HKMA', GEN],
  ['Hong Kong Monetary Authority and Bank Negara Malaysia Strengthen Bilateral Cooperation', 'HKMA', GEN, [BANK]],
  ['Prudential Regulation Authority Annual Report 2025/26', 'UK PRA', BANK],
  ['Consultation on revised disclosure templates and tables Annex 2: Standard disclosure templates for making disclosure under the LAC Rules', 'HKMA', BANK],
  ['Treasury Markets Summit 2026', 'HKMA', MONE],
  // Malaysia
  ['Monetary and Financial Developments in July 2026', 'BNM', MONE],
  ['Economic and Financial Developments in Malaysia in the Second Quarter of 2026', 'BNM', MONE],
  ['Renewal of Bilateral Currency Swap Arrangement Agreement between Bank Negara Malaysia and People\'s Bank of China', 'BNM', MONE],
  ['Monetary Policy Statement', 'BNM', MONE],
  ['Advancing Nature-Related Financial Risk and Opportunity Assessment in Malaysia', 'BNM', ESG],
  ['SC Issues Guidance Note on Sukuk to Strengthen Alignment with Maqasid al-Shariah', 'SC Malaysia', CAPM],
  ['Former Company Director Jailed Five Years for Unlicensed Fund Management Activities', 'SC Malaysia', FUND],
  ['SC and Bursa Malaysia Collaborate to Advance Informed Investing Among Retail Investors', 'SC Malaysia', COND],
  // Data privacy is a sector of its own, apart from AI and cyber risk; a data
  // broker is not a securities broker
  ['TikTok withdraws two appeals in children’s privacy action and accepts £12.7m fine', 'ICO', PRIV, [TECH]],
  ['CalPrivacy Continues Enforcement Blitz with Action Against Virginia Data Broker', 'CalPrivacy (CPPA)', PRIV, [CAPM, TECH]],
  ['Know your privacy obligations under the Anti-Money Laundering / Counter-Terrorism Financing reforms', 'OAIC', [PRIV, AML], [TECH]],
  ['个人信息出境认证办法', 'CAC', PRIV, [TECH]],
  ['PDPC Issues Guidance for Organisations on Responsible  Use of Personal Data in Generative AI', 'PDPC', [TECH, PRIV]],
  ['Strengthening Cyber Resilience amid Artificial Intelligence-Empowered Cyber Threats', 'HKMA', TECH, [PRIV]],
  // A data protection authority's notice with no topic words is about data privacy
  ['The PIPC Issues Recommendations on Robot Vacuum Makers', 'PIPC', PRIV],
  ['ICO welcomes transition to new Information Commission', 'ICO', PRIV],
  // and its other notices are in data privacy too
  ['Complaints about automated nuisance calls hit five-year high', 'ICO', [COND, PRIV]],
  ['New resources on transparency for use of AI and automated decision-making', 'OAIC', [TECH, PRIV]]
];

for (const [title, regulator, main, never = []] of SECTOR_EXAMPLES) {
  test(`sector: ${title.slice(0, 70)}`, () => {
    const tagged = classifySectors({ title, regulator });
    const got = `got ${tagged.sectors.join(', ')} (${JSON.stringify(tagged.reasons)})`;
    if (Array.isArray(main)) {
      assert.ok(main.includes(tagged.sectors[0]), got);
      for (const s of main) assert.ok(tagged.sectors.includes(s), got);
    } else {
      assert.equal(tagged.sectors[0], main, got);
    }
    for (const sector of never) assert.ok(!tagged.sectors.includes(sector), `should not be ${sector}: ${JSON.stringify(tagged.reasons)}`);
  });
}

test('every sector tag says which words gave it, or why it is a default', () => {
  for (const [title, regulator] of SECTOR_EXAMPLES) {
    const tagged = classifySectors({ title, regulator });
    // One sector at most is given without words, and the fallback says why
    const withoutWords = tagged.sectors.filter(s => !tagged.reasons[s]?.length);
    assert.equal(withoutWords.length, tagged.fallback ? 1 : 0, `${title}: ${withoutWords.join(', ')} has no words`);
  }
});

test('text words count less than title words', () => {
  // One stray word in the summary is not enough for a sector
  const one = classifySectors({ title: 'Annual Report 2025/26', text: 'The report mentions climate once.', regulator: 'MAS' });
  assert.deepEqual(one.sectors, [GEN]);
  // Three different words are
  const three = classifySectors({ title: 'Annual Report 2025/26', text: 'Climate risk, carbon emissions and net-zero transition plans.', regulator: 'MAS' });
  assert.equal(three.sectors[0], ESG);
});

// [type, title, format]
const FORMAT_EXAMPLES: [string, string, string][] = [
  ['', 'Regulatory Notice 26-15: A broker-dealer’s duty of best execution applies to customer orders', 'Announcements'],
  ['', 'Regulatory Notice 26-12: SEC staff issued a no-action letter', 'Announcements'],
  ['', 'SGX RegCo sets limit to cure period for suspended companies', 'Announcements'],
  ['', 'Prescribed Persons (Reports on Disclosures of Information) Regulations 2017 – Annual Report 2025/26', 'Announcements'],
  ['', 'FINRA has amended its TRACE rules to expand the scope of the principal transaction indicator', 'Announcements'],
  ['', 'Opening remarks by Tan Boon Gin, SGX RegCo CEO, for the press briefing on the launch of a public consultation', 'Announcements'],
  ['', 'Keynote by Tan Boon Gin, SGX RegCo CEO, at the Singapore Governance and Transparency Forum 2026', 'Announcements'],
  ['', 'Regulator’s Column: Forward guidance – Why it matters and how to get it right', 'Announcements'],
  ['', 'Self-Regulatory Organizations; Cboe BZX Exchange, Inc.; Order Granting Approval of a Proposed Rule Change', 'Announcements'],
  ['', 'Corporate governance practices within NutryFarm International fall short of standards expected', 'Enforcement'],
  ['', 'SFC reprimands and fines Zheng Da International Financial Holding Limited $7 million', 'Enforcement'],
  ['', 'ASIC sues lead generation business over alleged misleading comparison claims', 'Enforcement'],
  ['', 'Former Warwick Gold director Yuetu Ma disqualified from managing corporations for four years', 'Enforcement'],
  ['', 'Samlit Moneychanger Pte. Ltd. to be Charged for Offences', 'Enforcement'],
  ['', 'ASIC halts offers in mortgage schemes managed by Australian Secure Capital Fund', 'Enforcement'],
  ['', 'Key Enforcement Actions Taken by MAS in Q3 2026', 'Enforcement'],
  ['', 'MAS Consults on Protected Cell Company Framework', 'Consultations'],
  ['NEWS', 'ESMA seeks evidence on the use of tokenised collateral in central clearing', 'Consultations'],
  ['', 'Regulatory Notice 26-14: FINRA seeks comment on a proposal to modernize Rule 2210', 'Consultations'],
  ['', 'SGX RegCo proposes rule changes to facilitate wider adoption of broker custody accounts', 'Consultations'],
  ['', 'Agency Information Collection Activities; Proposed Collection; Comment Request', 'Consultations'],
  ['', 'Guidelines on Liquidity Risk Management (Banks)', 'Guidelines'],
  ['', 'Code of Practice chapters regarding valuation in resolution', 'Guidelines'],
  ['', 'Global standard-setting bodies publish a toolkit for cyber resilience at FMIs', 'Technical Standards'],
  ['', 'SC Charges Brothers for Dealing in Securities without Licence', 'Enforcement'],
  ['', 'Federal Court Rules in SC’s Favour, Leave Application of Former Patimas Executive Dismissed', 'Enforcement'],
  ['', 'Court of Appeal Dismisses Ricky Wong’s Appeal against Injunction Order', 'Enforcement'],
  ['', 'Bank Charges and Fees: Transparency Requirements', 'Announcements'],
  ['', 'MAS Sets Out Supervisory Expectations on Responsible AI Adoption by Financial Institutions', 'Guidelines'],
  ['', 'Monetary Policy Statement', 'Announcements'],
  ['CIRCULAR', 'Implementation of Basel III Final Reform Package', 'Circulars'],
  ['', 'PS16/26 – PRA rule changes to accommodate HM Treasury’s Overseas Prudential Requirements Regime', 'Guidelines'],
  ['', 'Announcement - In relation to the matter of Paladin Limited (Stock Code: 495) Cancellation of listing', 'Enforcement'],
  // Data protection authorities
  ['PRESS RELEASE', 'The PIPC Sanctions KT Corporation for Data Breaches', 'Enforcement'],
  ['', 'UN Sanctions List Updated', 'Announcements'],
  ['', 'Thematic Review of Sanctions Screening Systems', 'Announcements'],
  ['ANNOUNCEMENT', 'New Commission\'s Decision and Undertakings on 26 February 2026', 'Enforcement'],
  ['ANNOUNCEMENT', 'New Undertakings on 9 April 2026', 'Enforcement'],
  ['NEWS', 'Italian DPA fines Wind Tre EUR 16 700 000 for unlawful telemarketing and data protection infringements', 'Enforcement'],
  ['NEWS', 'ICO takes action against Metropolitan Police Service over information governance failures', 'Enforcement'],
  ['ANNOUNCEMENT', 'PUBLIC CONSULTATION PAPER NO. 1/2026 : ARTIFICIAL INTELLIGENCE (AI) AND PERSONAL DATA PROTECTION FRAMEWORK', 'Consultations'],
  ['', 'OAIC releases Exposure Draft of the Children’s Online Privacy Code', 'Consultations']
];

for (const [type, title, format] of FORMAT_EXAMPLES) {
  test(`format: ${title.slice(0, 70)}`, () => {
    const tagged = classifyFormat(type, title);
    assert.equal(tagged.format, format, tagged.reason);
  });
}

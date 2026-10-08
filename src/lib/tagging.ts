// Sector and format tags for notices, by keyword rules. Every tag records the
// words that triggered it, so a wrong tag can be traced to its rule (shown on
// each notice as "Why these tags?") and checked against the labelled examples
// in tests/tagging.test.ts.
//
// Rules match whole words only. A word in the title counts 3, a word in the
// summary or key points counts 1 (each distinct word once), and a sector needs
// 3 to be given: one title word, or three different words in the text. A
// notice gets up to three sectors, strongest first; the first is its main one.
import type { InstrumentFormat, SectorDomain } from '../types/regulatory';

export const SECTORS: SectorDomain[] = [
  'Banking & Prudential',
  'Capital Markets & Listings',
  'Funds & Asset Management',
  'Insurance & Pensions',
  'FinTech, Payments & Digital Assets',
  'AI, Cyber & Tech Risk',
  'ESG & Sustainability',
  'AML/CFT & Financial Crime',
  'Conduct & Consumer Protection',
  'Monetary & Financial Stability',
  'General & Institutional'
];

// Matched case-insensitively unless the pattern is listed in CASE_SENSITIVE
const SECTOR_RULES: Record<Exclude<SectorDomain, 'General & Institutional'>, RegExp[]> = {
  'Banking & Prudential': [
    /(?<!central )\bbanks?\b/, /\bbanking\b/, /\bcapital (adequacy|requirements?|buffers?|rules|framework|ratios?|instruments?)\b/,
    /\bbasel\b/, /\bliquidity (risk|coverage|facilit\w*|ratio)\b/, /\bleverage ratios?\b/, /\bcredit risk\b/, /\birrbb\b/,
    /\binterest rate risk\b/, /\bdeposits?\b/, /\bdeposit protection\b/, /\bloans?\b/, /\blending\b/, /\bmortgages?\b/,
    /\bcredit cards?\b/, /\b(recovery and )?resolution (planning|regime|plans?)\b/, /\bvaluation in resolution\b/,
    /\bloss[- ]absorbing\b/, /\btlac\b/, /\bsystemically important\b/, /\b[dg]-sibs?\b/, /\bring-fenced\b/,
    /\bstress[- ]test\w*\b/, /\bprudential\b/, /\bsupervisory review\b/, /\bexpected credit loss\w*\b/, /\bifrs 9\b/,
    /\bauthori[sz]ed institutions?\b/, /\bbanking licen[cs]e\b/, /\bspm\b/, /\blarge exposures?\b/,
    /\btier [12]\b/, /\bgroup capital\b/, /\bislamic banking\b/, /\bbdr\b/, /\blac rules\b/, /\bbanking disclosure\b/
  ],
  'Capital Markets & Listings': [
    /\blistings?\b/, /\blisted (companies|issuers?|compan\w+)\b/, /\bipos?\b/, /\bprospectus\b/, /\bstock exchanges?\b/,
    /\bexchange['’]s\b/, /\bthe exchange\b/, /\bstock code\b/, /\bsecurities markets?\b/,
    /\bboard lots?\b/, /\btrading (rules|halts?|hours|functionalit\w+|participants?)\b/, /\bclearing\b/, /\bcentral counterpart\w*\b/,
    /\bccps?\b/, /\bsettlement\b/, /\bpost-trade\b/, /\bdepositor(y|ies)\b/, /\bcsds?\b/, /\bderivatives?\b/,
    /\bfutures\b/, /\botc\b/, /\bover-the-counter\b/, /\bmarket[- ]mak\w+\b/, /\bshort sell\w*\b/, /\bcorporate governance\b/,
    /\bdirectors['’]? duties\b/, /\bboard (renewal|of directors)\b/, /\bindependent directors?\b/, /\bmanaging corporations\b/,
    /\bself-regulatory organi[sz]ations?\b/, /\bbroker[- ]dealers?\b/, /\bbrokers?\b/,
    /\bbest execution\b/, /\btrace\b/, /\bmarket integrity\b/, /\binsider (trading|information|dealing)\b/,
    /\bmarket (misconduct|manipulation|structure)\b/, /\btakeovers?\b/, /\bspacs?\b/, /\bdual listings?\b/,
    /\bdematerialis\w+\b/, /\bcapital markets?\b/, /\bequities\b/, /\bbonds? market\b/, /\bfixed income\b/,
    /\bcatalist\b/, /\bmainboard\b/, /\bgem\b/, /\blisting rules\b/, /\bsecurities listing\b/,
    /\binside information\b/, /\b(high-speed|high-frequency) trading\b/, /\bshare financing\b/, /\bmargin (financing|lending|requirements)\b/,
    /\beuribor\b/, /\blibor\b/, /\bbenchmarks?\b/, /\binvestor identification\b/, /\bremuneration disclosures?\b/,
    /\bsukuk\b/, /\bdealing in securities\b/, /\bislamic capital market\b/
  ],
  'Funds & Asset Management': [
    /(?<!own |guarantee |clearing |exchange |pension |compensation |client )\bfunds?\b/, /\bfund management\b/, /\basset management\b/, /\basset managers?\b/, /\bcollective investment schemes?\b/,
    /\bunit trusts?\b/, /\bmutual funds?\b/, /\betfs?\b/, /\bexchange[- ]traded funds?\b/, /\breits?\b/,
    /\bprivate (credit|markets?|equity)\b/, /\binvestment trusts?\b/, /\bmanaged investment schemes?\b/, /\but code\b/,
    /\bwealth management\b/, /\binvestment managers?\b/, /\bfund types?\b/
  ],
  'Insurance & Pensions': [
    /\binsur(ance|ers?)\b/, /\breinsur\w*\b/, /\bcaptives?\b/, /\bsolvency\b/, /\borsa\b/, /\bprotected cell\b/,
    /\bactuar\w+\b/, /\bpensions?\b/, /\bsuperannuation\b/, /\bannuit\w+\b/, /\bfriendly societies\b/, /\bpolicyholders?\b/,
    /\balternative risk transfer\b/, /\btakaful\b/, /\billustration rate\b/
  ],
  'FinTech, Payments & Digital Assets': [
    /\bcrypto\w*\b/, /\bstablecoins?\b/, /\bvirtual assets?\b/, /\bdigital assets?\b/, /\btokeni[sz]\w*\b/, /\bblockchains?\b/,
    /\bdistributed ledger\b/, /\bdlt\b/, /\bdigital payment tokens?\b/, /\bpayments\b/, /\bpayment (services?|systems?|service providers?|institutions?|cards?)\b/,
    /\bstored value\b/, /\bsvf\b/, /\be-money\b/, /\bmica\b/, /\bfintech\b/, /\bsandbox\b/, /\bcbdcs?\b/,
    /\bdigital (currenc\w+|money|bonds?)\b/, /\bopen banking\b/, /\bcrowdfunding\b/, /\bremote on-boarding\b/,
    /\b(digital|financial) innovation\b/
  ],
  'AI, Cyber & Tech Risk': [
    /\bartificial intelligence\b/, /\bAI\b/, /\bmachine learning\b/, /\bgenerative\b/, /\balgorithmic\b/, /\bcyber\w*\b/,
    /\btechnology risk\b/, /\btechnology resilience\b/, /\boperational resilience\b/, /\boutsourcing\b/,
    /\bthird-party risk\b/, /\bcloud\b/, /\bincident reporting\b/, /\bquantum\b/, /\bict\b/,
    /\binformation and communication technology\b/, /\bdata (protection|governance)\b/, /\bit risk\b/,
    /\boperational risk\b/
  ],
  'ESG & Sustainability': [
    /\besg\b/, /\bclimate\b/, /\bsustainab(le|ility)\b/, /\bgreen (bonds?|finance|taxonomy|loans?)\b/,
    /\btransition (plans?|planning|finance)\b/, /\bnet[- ]zero\b/, /\bemissions?\b/, /\bcarbon\b/, /\benvironmental risk\b/,
    /\bnature[- ]related\b/, /\bbiodiversity\b/, /\btcfd\b/, /\bissb\b/, /\bsocial bonds?\b/, /\badaptation\b/,
    /\bdiversity\b/
  ],
  'AML/CFT & Financial Crime': [
    /\bmoney laundering\b/, /\baml\b/, /\bcft\b/, /\bterroris[mt]\w*\b/, /\b(financial|targeted|economic|un) sanctions\b/,
    /\bsanctions (list|regime|screening)\b/, /\bfinancial crime\b/, /\bfraud\w*\b/, /\bscams?\b/, /\bmoneychangers?\b/,
    /\bremittance\b/, /\bpolitically exposed\b/, /\bpeps?\b/, /\bsource of wealth\b/, /\bcustomer due diligence\b/,
    /\bcdd\b/, /\bkyc\b/, /\bsuspicious transactions?\b/, /\bmisappropriat\w+\b/, /\bbribery\b/, /\bcorruption\b/,
    /\bmule accounts?\b/
  ],
  'Conduct & Consumer Protection': [
    /\bconsumers?\b/, /\bcustomer (protection|outcomes)\b/, /\bmisleading\b/, /\bmis-?selling\b/, /\bfinancial advi(ce|sers?|sors?)\b/,
    /\badvice (failures|licensees?)\b/, /\bconflicted remuneration\b/, /\bbest interests?\b/, /\bcomplaints?\b/,
    /\bfair (dealing|treatment)\b/, /\bproduct highlights\b/, /\bcomplex products?\b/, /\binvestor protection\b/,
    /\bretail investors?\b/, /\bmisconduct\b/, /\bbalanced scorecard\b/, /\bcredit checks?\b/, /\bdebt collect\w+\b/,
    /\bvulnerable\b/, /\bunfair\b/, /\bconsumer duty\b/, /\binvestor recourse\b/, /\bcompensation\b/, /\bdispute resolution\b/,
    /\bfinancial (literacy|education)\b/, /\bcommunications with the public\b/, /(?<!listing )\bsuitability\b/,
    /\bremuneration (framework|structures?) (for|of) (representatives|licensed|intermediar\w+)\b/, /\bprotect(s|ing)? investors\b/,
    /\bcompetency framework\b/, /\bintermediar(y|ies)\b/, /\bgrace period\b/
  ],
  'Monetary & Financial Stability': [
    /\bmonetary policy\b/, /\bexchange rates?\b/, /\b(foreign currency|international|foreign exchange) reserves?\b/,
    /\breserve assets\b/, /\bfinancial stability\b/, /\bsystemic risk\b/, /\bexchange fund\b/, /\bcurrency board\b/,
    /\b(rmb|renminbi) bills\b/, /\brenminbi\b/, /\blocal currenc(y|ies)\b/, /\binflation\b/, /\bg20\b/,
    /\b(global )?econom(y|ic) (outlook|vulnerabilit\w+|pressure\w*|conditions)\b/, /\bcentral banks?\b/,
    /\bgovernors['’]? meeting\b/, /\bemeap\b/, /\bbanknotes?\b/, /\bcoins?\b/, /\bgovernment bonds?\b/, /\bsilver bond\b/,
    /\binterest rates?\b/, /\bmoney markets?\b/, /\btrust in money\b/, /\bmonetary system\b/,
    /\b(monetary|economic) and financial developments\b/, /\btreasury markets?\b/, /\bcurrency swap\b/, /\bswap arrangements?\b/,
    /\bgdp\b/, /\bgross domestic product\b/, /\bbalance of payments\b/
  ]
};

// Regulators' and institutions' own names are removed before matching, so
// "Bank of Thailand" isn't banking and "Financial Stability Board" isn't
// financial stability
const NAMES = new RegExp([
  "prudential regulation authority", "monetary authority of singapore", "hong kong monetary authority",
  "bank negara malaysia", "bank of england", "bank of thailand", "bank indonesia", "bank of japan",
  "people['’]s bank of china", "reserve bank of \\w+", "bank for international settlements", "european central bank",
  "financial stability board", "securities and futures commission", "securities commission(?: malaysia)?",
  "securities and exchange (?:commission|board of india)", "australian securities and investments commission",
  "singapore exchange(?: regulation| limited)?", "hong kong exchanges and clearing", "japan exchange group",
  "tokyo stock exchange", "osaka exchange", "insurance authority", "financial services agency",
  "commodity futures trading commission", "european securities and markets authority", "basel committee on banking supervision",
  "association of banks in singapore", "hong kong association of banks", "central bank governors"
].join('|'), 'gi');

// "AI" is only a match in capitals (so "said", "retail" and "Thai" are not)
const CASE_SENSITIVE = new Set(['\\bAI\\b']);

// Exchanges, self-regulatory bodies and securities regulators mainly regulate
// markets, so a notice of theirs with no topic words is about capital markets,
// and in a tie between sectors capital markets comes first. Everyone else's
// goes to General & Institutional rather than a guessed sector.
const MARKET_REGULATORS = /^(HKEX|SGX RegCo|ASX|TSE|OSE|TOCOM|JPX|JPX-R|FINRA|Bursa|SFC|US SEC|SEC|CFTC|ESMA|SC Malaysia)\b/;
// Likewise the bank and insurer supervisors and the Basel Committee
const PRUDENTIAL_REGULATORS = /^(UK PRA|PRA|BCBS)\b/;

// In a tie, a topic (financial crime, climate, technology...) comes before the
// industry it applies to: "Guidelines on Environmental Risk Management for
// Insurers" is mainly ESG, and also Insurance
const TIE_ORDER: SectorDomain[] = [
  'AML/CFT & Financial Crime', 'ESG & Sustainability', 'AI, Cyber & Tech Risk', 'FinTech, Payments & Digital Assets',
  'Conduct & Consumer Protection', 'Insurance & Pensions', 'Funds & Asset Management', 'Banking & Prudential',
  'Capital Markets & Listings', 'Monetary & Financial Stability', 'General & Institutional'
];

export interface SectorTagging {
  sectors: SectorDomain[];
  // The words that gave each sector, title words first
  reasons: Partial<Record<SectorDomain, string[]>>;
  // No topic words matched; the sector is a default
  fallback?: string;
}

function matches(pattern: RegExp, text: string): string | null {
  const flags = CASE_SENSITIVE.has(pattern.source) ? 'g' : 'gi';
  const m = text.match(new RegExp(pattern.source, flags));
  return m ? m[0] : null;
}

export function classifySectors(input: { title: string; text?: string; regulator?: string }): SectorTagging {
  const title = (input.title || '').replace(NAMES, ' ');
  const text = (input.text || '').replace(NAMES, ' ');
  const marketRegulator = MARKET_REGULATORS.test(input.regulator || '');
  const scored: { sector: SectorDomain; score: number; words: string[] }[] = [];
  for (const [sector, patterns] of Object.entries(SECTOR_RULES) as [SectorDomain, RegExp[]][]) {
    let score = 0;
    const titleWords: string[] = [];
    const textWords: string[] = [];
    for (const pattern of patterns) {
      const inTitle = matches(pattern, title);
      if (inTitle) {
        score += 3;
        titleWords.push(inTitle.toLowerCase() === 'ai' ? 'AI' : inTitle.toLowerCase());
        continue;
      }
      const inText = text ? matches(pattern, text) : null;
      if (inText) {
        score += 1;
        textWords.push(inText.toLowerCase() === 'ai' ? 'AI' : inText.toLowerCase());
      }
    }
    if (score >= 3) scored.push({ sector, score, words: [...titleWords, ...textWords] });
  }
  const rank = (s: SectorDomain) => (marketRegulator && s === 'Capital Markets & Listings' ? -1 : TIE_ORDER.indexOf(s));
  scored.sort((a, b) => b.score - a.score || rank(a.sector) - rank(b.sector));
  const top = scored.slice(0, 3);
  if (top.length === 0) {
    const regulator = input.regulator || '';
    if (marketRegulator) {
      return { sectors: ['Capital Markets & Listings'], reasons: {}, fallback: `no topic words matched; ${regulator} regulates markets` };
    }
    if (PRUDENTIAL_REGULATORS.test(regulator)) {
      return { sectors: ['Banking & Prudential'], reasons: {}, fallback: `no topic words matched; ${regulator} is a prudential supervisor` };
    }
    return { sectors: ['General & Institutional'], reasons: {}, fallback: 'no topic words matched' };
  }
  return {
    sectors: top.map(s => s.sector),
    reasons: Object.fromEntries(top.map(s => [s.sector, [...new Set(s.words)]]))
  };
}

// Formats. Checked in this order; the first that matches wins.
const SPEECH = /^(new )?(keynote|opening|welcome|closing|speech|remarks|address)\b|\b(keynote|speech|remarks|address) by\b/i;
const APPROVAL = /\border granting approval\b|\bnotice of (effectiveness|approval)\b/i;
const CONSULTATION = /\bconsult(s|ed|ing|ation|ations|ative)?\b|\bcomment request\b|\bseeks? (public )?(comments?|feedback|views)\b|\brequest for (comments?|information)\b|\bexposure drafts?\b|\bdiscussion papers?\b|\bcall for (evidence|input|views)\b|\bproposed (rules?|rule changes?|amendments?|changes?|framework|guidelines?|regulat\w*|requirements?|listing)\b|\bproposes?\b|\bproposals? (on|to|for)\b|\bdraft\b/i;
const ENFORCEMENT = /\b(enforcement actions?|disciplinary actions?|disciplinary committee|takes? action|reprimand(s|ed)?|censure[sd]?|fine[sd]?|fines|penalt(y|ies)|infringement notices?|charged|charges against|sues|sued|sentenced|convicted|jailed|imprisonment|prosecut\w*|banned|bans?|disqualified|suspends|revok(es|ed)|cancels|cancelled|stop orders?|halts offers|prohibition orders?|cease[- ]and[- ]desist|compound(s|ed)|falls? short of|wins suit|suit against|injunction|committal|judgment against|appeal against|cancellation of listing|court of appeal|high court|federal court|in (its|the \w+['’]s|\w+['’]s) favour)\b/i;
// "SC Charges Brothers…": an agency charging someone, at the start of a title
// (not "Bank Charges and Fees")
const CHARGES = /^[a-z][\w.&'’-]* charges\b(?! (and|for|on|of|to|payable|levied|applicable)\b)/i;
const TECHNICAL = /\b(technical standards?|regulatory technical|implementing technical|data standards?|reporting templates?|return templates?|disclosure templates?|xbrl|interoperab\w*|toolkit)\b/i;
const GUIDELINES = /\bguidelines?\b|(?<!forward )\bguidance\b|\bcodes? of practice\b|\bpractice notes?\b|\bpolicy (manual|documents?)\b|\bfaqs?\b|\binterpretation note\b|\bsupervisory policy manual\b|\bsupervisory expectations?\b|(?<!monetary )\bpolicy statements?\b|\bPS\d{1,2}\/\d{2}\b/i;

export interface FormatTagging {
  format: InstrumentFormat;
  reason: string;
}

export function classifyFormat(type: string, title: string): FormatTagging {
  const text = `${type} ${title}`;
  const hit = (re: RegExp) => text.match(re)?.[0];
  let m: string | undefined;
  if ((m = hit(SPEECH))) return { format: 'Circulars', reason: `speech or remarks ("${m.trim()}")` };
  if ((m = hit(APPROVAL))) return { format: 'Circulars', reason: `approval of a proposal ("${m}")` };
  if ((m = hit(CONSULTATION))) return { format: 'Consultations', reason: `"${m}"` };
  if ((m = hit(ENFORCEMENT) ?? title.trim().match(CHARGES)?.[0])) return { format: 'Enforcement', reason: `"${m}"` };
  if ((m = hit(TECHNICAL))) return { format: 'Technical Standards', reason: `"${m}"` };
  if ((m = hit(GUIDELINES))) return { format: 'Guidelines', reason: `"${m}"` };
  return { format: 'Circulars', reason: 'no format words matched' };
}

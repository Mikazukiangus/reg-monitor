// Which items of a government's general news are about rules for artificial
// intelligence. Regulators' own news uses mentionsAi; general feeds (a
// ministry's or an attorney general's news, China's policy library) need AI in
// the title and a word for rules or their enforcement in the title or summary,
// so funding rounds, industry programmes and passing mentions are left out.

const AI_WORDS = /\bartificial intelligence\b|\bmachine learning\b|\bgenerative\b|\bchatbots?\b|\bdeepfakes?\b|\bautomated decision[- ]?making\b|\bfrontier models?\b|\bfoundation models?\b|\blarge language models?\b|\bgeneral[- ]purpose AI\b|\balgorithmic\b|\bsuper ?intelligen\w*/i;
// Only in capitals, so "said" and "Thai" don't count
const AI_ABBREVIATIONS = /\b(?:AI|A\.I\.|GPAI|LLMs?|ADMT)\b/;
// Chinese and Japanese: artificial intelligence, generative, deep synthesis,
// large models, AI agents, full-width "AI"
const CJK_AI = /人工智能|人工知能|生成式|深度合成|大模型|智能体|ＡＩ/;

export function mentionsAi(text: string): boolean {
  return AI_WORDS.test(text) || AI_ABBREVIATIONS.test(text) || CJK_AI.test(text);
}

const RULE_WORDS = /\b(?:acts?|laws?|legislation|bills?|decrees?|regulat\w*|rules?|rulemaking|guidelines?|guidance|codes? of (?:practice|conduct)|frameworks?|(?:AI|model) safety|trust(?:worthy)?|ethic\w*|governance|oversight|enforc\w*|complian\w*|obligations?|standards?|consult\w*|comments?|transparen\w*|label\w*|watermark\w*|risks?|accountab\w*|liabilit\w*|prohibit\w*|bans?|investigat\w*|inquiry|settle\w*|lawsuit|sues?|penalt\w*|fines?|executive orders?|protections?|safeguards?|copyright)\b/i;

// Chinese: measures, provisions, regulations, laws, norms, labelling, safety,
// ethics, governance, guidelines, standards, filing, calls for comment.
// Plans to promote AI in an industry ("人工智能+") don't use these words.
const RULE_WORDS_ZH = /办法|规定|条例|法律|法规|规范|标识|安全|伦理|治理|指引|指南|标准|备案|征求意见/;
// Pilot zones, demonstration projects, innovation platforms, challenge lists
const PROGRAMME_ZH = /试验区|示范|创新平台|揭榜/;

// A law or order being signed, only in the title: summaries also say a
// partnership or an agreement was signed
const SIGNED = /\b(?:signs?|signed)\b/i;

export function isAiRuleNews(title: string, text = ''): boolean {
  const both = `${title} ${text}`;
  return mentionsAi(title) && !PROGRAMME_ZH.test(title) && (RULE_WORDS.test(both) || RULE_WORDS_ZH.test(both) || SIGNED.test(title));
}

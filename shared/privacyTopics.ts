// Which items are about data privacy. A data protection authority's own news
// (the ICO, EDPB, PDPC and so on) is all about privacy and is kept whole;
// feeds that cover other work too (the FTC's press releases, the OAIC's, which
// also cover freedom of information, China's policy library) keep an item only
// if it mentions privacy or personal data.

const PRIVACY_WORDS = /\bprivacy\b|\bpersonal (?:data|information)\b|\bdata (?:protection|breach\w*|privacy|brokers?|subjects?)\b|\bsensitive (?:personal )?data\b|\b(?:location|health|biometric|children['’]s) data\b|\bchildren['’]s online privacy\b|\bdata deletion\b|\bright to (?:delete|deletion|erasure)\b/i;
// Only in capitals: the EU's and UK's GDPR, the US children's privacy and
// health privacy laws, Singapore's and Malaysia's PDPA, Japan's APPI and
// California's privacy acts. Not "DPA", which is also a deferred prosecution
// agreement.
const PRIVACY_ABBREVIATIONS = /\b(?:GDPR|COPPA|HIPAA|PDPA|APPI|CCPA|CPRA)\b/;
// Chinese and Japanese: personal information, privacy
const CJK_PRIVACY = /个人信息|個人情報|隐私|プライバシー/;

export function mentionsPrivacy(text: string): boolean {
  return PRIVACY_WORDS.test(text) || PRIVACY_ABBREVIATIONS.test(text) || CJK_PRIVACY.test(text);
}

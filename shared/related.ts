// Links a consultation to the conclusions or response published later, and
// back. Regulators don't publish this link in a machine-readable form, so it
// is matched by regulator and title words, and labelled as such on the site.
// The server stores the pairs (server/links.ts); without a history, the
// notices at hand are matched with each other.
import type { RelatedLink } from './regulatory';

export interface RelatedCandidate {
  id: string;
  regulator: string;
  format: string;
  title: string;
  publishedAt?: string;
  dossierUrl?: string;
}


// The outcome of a consultation: its conclusions, a response to the comments,
// a decision to proceed, or a final version. "FSTB and SFC conclude
// consultations", "Response to Consultation Paper", ASX's "response paper" and
// "response to feedback received", the FSB's "Overview of consultation
// responses" and "finalises", and the PRA's policy statements (PS19/26).
// A title read as an outcome only shows a link when an earlier consultation
// from the same regulator shares most of its topic words, so this can be broad.
const CONCLUSION = new RegExp([
  /\bconclu(?:de|des|ded|sion|sions)\b/,
  /\bresponses? (?:paper|to (?:the )?(?:public )?(?:consultation|feedback|comments))\b/,
  /\bconsultation (?:conclusions|responses?)\b/,
  /\bfeedback (?:statement|received)\b/,
  /\bproceeds? (?:to|with)\b/,
  /\bfinali[sz](?:es|ed)\b|\bfinal report\b/,
  /^PS\d+\/\d+\b/
].map(r => r.source).join('|'), 'i');
// Events that "conclude" ("JC3 Journey to Zero Conference 2026 concludes")
const EVENT = /\b(?:conference|forum|summit|meeting|visit|dialogue|roundtable|symposium|workshop|seminar|webinar|mission)s?\b/i;
const CONSULTATION = /\bconsult(?:s|ing|ation|ative)?\b|^CP\d+\/\d+\b/i;

// Words that say what kind of document it is rather than what it is about
const GENERIC = new Set(
  ('a an and the of on to for in at by with from into its their our this that these those ' +
    'consult consults consultation consultations consulting paper papers conclusion conclusions concludes concluded ' +
    'response responses respond publishes published publish issues issued announces proposed proposal proposals ' +
    'public joint jointly further feedback final finalises finalised report proceed proceeds statement ' +
    'amendments amendment annex revised changes released summarising received relation titled other ' +
    'january february march april may june july august september october november december ' +
    'monday tuesday wednesday thursday friday ' +
    'mas sfc hkma hkex exchange pra fca esma fsb bis bcbs asic asx jfsa sec cftc fstb').split(' ')
);
// Document numbers that differ between a consultation and its outcome (CP6/26, PS19/26)
const DOCUMENT_NUMBER = /^(?:cp|ps|ss|dp|id)\d+$/;

const wordCache = new Map<string, Set<string>>();

function topicWords(title: string): Set<string> {
  const cached = wordCache.get(title);
  if (cached) return cached;
  if (wordCache.size > 5000) wordCache.clear();
  const words = new Set(
    title
      .toLowerCase()
      .replace(/[’']s\b/g, '')
      .replace(/\bover-the-counter\b/g, 'otc')
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 2 && !GENERIC.has(w) && !DOCUMENT_NUMBER.test(w))
  );
  wordCache.set(title, words);
  return words;
}

// Share of the shorter title's topic words found in the other title
function similarity(a: string, b: string): number {
  const wa = topicWords(a);
  const wb = topicWords(b);
  if (wa.size < 2 || wb.size < 2) return 0;
  const shared = [...wa].filter(w => wb.has(w)).length;
  return shared / Math.min(wa.size, wb.size);
}

// The same regulator, by name. (Matching part of a name linked BIS with
// "US Commerce (BIS)"; no source gives two regulators in one name.)
const sameRegulator = (a: string, b: string) => a === b;

export const isConclusion = (title: string) => CONCLUSION.test(title) && (!EVENT.test(title) || /\bconsult/i.test(title));
// A title can conclude one consultation and open another ("Basel Committee
// finalises measures ... and consults on ..."): it is then both.
const OPENS_CONSULTATION = /\bconsults? on\b|\bseeks? (?:views|comments|feedback)\b/i;
export const isConsultation = (c: { format: string; title: string }) =>
  (!isConclusion(c.title) || OPENS_CONSULTATION.test(c.title)) && (c.format === 'Consultations' || CONSULTATION.test(c.title));

const MIN_SIMILARITY = 0.6;

// A consultation and its outcome, and how many of their topic words they share
export interface LinkPair {
  consultationId: string;
  conclusionId: string;
  score: number;
}

// Every consultation and outcome among `notices` that match: the same
// regulator, the consultation first, and most topic words shared. With `ids`,
// only pairs that include one of those notices.
export function linkPairs(notices: RelatedCandidate[], ids?: Set<string>): LinkPair[] {
  const byRegulator = new Map<string, RelatedCandidate[]>();
  for (const n of notices) {
    if (!byRegulator.has(n.regulator)) byRegulator.set(n.regulator, []);
    byRegulator.get(n.regulator)!.push(n);
  }
  const pairs: LinkPair[] = [];
  for (const group of byRegulator.values()) {
    const consultations = group.filter(isConsultation);
    for (const conclusion of group.filter(c => isConclusion(c.title))) {
      const when = conclusion.publishedAt ? Date.parse(conclusion.publishedAt) : NaN;
      for (const consultation of consultations) {
        if (consultation.id === conclusion.id || (ids && !ids.has(consultation.id) && !ids.has(conclusion.id))) continue;
        // A consultation comes before its conclusions
        const t = consultation.publishedAt ? Date.parse(consultation.publishedAt) : NaN;
        if (!isNaN(t) && !isNaN(when) && t > when) continue;
        const score = similarity(conclusion.title, consultation.title);
        if (score >= MIN_SIMILARITY) pairs.push({ consultationId: consultation.id, conclusionId: conclusion.id, score });
      }
    }
  }
  return pairs;
}

// Links a notice shows: its consultations and outcomes among the pairs, the
// two closest of each
export function relatedOf(id: string, pairs: LinkPair[], notices: Map<string, RelatedCandidate>): RelatedLink[] {
  const links = (relation: RelatedLink['relation'], mine: LinkPair[], other: (p: LinkPair) => string) =>
    mine
      .sort((a, b) => b.score - a.score)
      .flatMap(p => {
        const c = notices.get(other(p));
        return c ? [{ id: c.id, title: c.title, relation, publishedAt: c.publishedAt, dossierUrl: c.dossierUrl }] : [];
      })
      .slice(0, 2);
  return [
    ...links('consultation', pairs.filter(p => p.conclusionId === id), p => p.consultationId),
    ...links('conclusion', pairs.filter(p => p.consultationId === id), p => p.conclusionId)
  ];
}

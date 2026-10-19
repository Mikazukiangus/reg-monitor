// Links a consultation to the conclusions or response published later, and
// back. Regulators don't publish this link in a machine-readable form, so it
// is matched by regulator and title words, and labelled as such on the site.
import type { RelatedLink } from '../types/regulatory';

export interface RelatedCandidate {
  id: string;
  regulator: string;
  format: string;
  title: string;
  publishedAt?: string;
  dossierUrl?: string;
}


const CONCLUSION = /\bconclu(?:des|ded|sion|sions)\b|\bresponse to (?:the )?(?:public )?consultation\b|\bconsultation (?:conclusions|response)\b/i;
const CONSULTATION = /\bconsult(?:s|ing|ation|ative)?\b/i;

// Words that say what kind of document it is rather than what it is about
const GENERIC = new Set(
  ('a an and the of on to for in at by with from into its their our this that these those ' +
    'consult consults consultation consultations consulting paper papers conclusion conclusions concludes concluded ' +
    'response responses respond publishes published publish issues issued announces proposed proposal proposals ' +
    'public joint further feedback mas sfc hkma hkex exchange pra fca esma fsb bis bcbs asic jfsa sec cftc').split(' ')
);

const wordCache = new Map<string, Set<string>>();

function topicWords(title: string): Set<string> {
  const cached = wordCache.get(title);
  if (cached) return cached;
  if (wordCache.size > 5000) wordCache.clear();
  const words = new Set(
    title
      .toLowerCase()
      .replace(/[’']s\b/g, '')
      .split(/[^a-z0-9]+/)
      .filter(w => w.length > 2 && !GENERIC.has(w))
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

// Regulators publishing jointly ("SFC and HKMA conclude ...") match either one
const sameRegulator = (a: string, b: string) => a === b || a.includes(b) || b.includes(a);

export const isConclusion = (title: string) => CONCLUSION.test(title);
export const isConsultation = (c: { format: string; title: string }) =>
  !isConclusion(c.title) && (c.format === 'Consultations' || CONSULTATION.test(c.title));

const MIN_SIMILARITY = 0.6;

export function findRelated(notice: RelatedCandidate, candidates: RelatedCandidate[]): RelatedLink[] {
  const conclusion = isConclusion(notice.title);
  const consultation = !conclusion && isConsultation(notice);
  if (!conclusion && !consultation) return [];
  const when = notice.publishedAt ? Date.parse(notice.publishedAt) : NaN;

  return candidates
    .filter(c => c.id !== notice.id && sameRegulator(c.regulator, notice.regulator))
    .filter(c => (conclusion ? isConsultation(c) : isConclusion(c.title)))
    .filter(c => {
      // A consultation comes before its conclusions
      const t = c.publishedAt ? Date.parse(c.publishedAt) : NaN;
      if (isNaN(t) || isNaN(when)) return true;
      return conclusion ? t <= when : t >= when;
    })
    .map(c => ({ c, score: similarity(notice.title, c.title) }))
    .filter(({ score }) => score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map(({ c }) => ({
      id: c.id,
      title: c.title,
      relation: conclusion ? ('consultation' as const) : ('conclusion' as const),
      publishedAt: c.publishedAt,
      dossierUrl: c.dossierUrl
    }));
}

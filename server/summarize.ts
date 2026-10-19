// Extractive summaries for regulatory documents. No generative model or
// external API: every key point is a sentence quoted verbatim from the source
// document, and key facts (deadlines, references) are pulled out with rules.
import type { KeyPoints } from '../src/types/regulatory.js';
import { tokenize, splitSentences } from './sentences.js';
import { extractDateFacts, documentDates } from './document-dates.js';

const SIGNAL = /\b(must|requires?|required|requirements?|deadline|effective|consult\w*|feedback|comments?|propos\w*|implement\w*|penalt\w*|fines?|enforce\w*|guidance|guidelines?|rules?|standards?)\b/i;

// TextRank over sentence cosine similarity, with a lead-position bonus and a
// boost for sentences that carry regulatory obligations.
function rankSentences(sentences: string[], count: number): string[] {
  if (sentences.length <= count) return sentences;
  const vectors = sentences.map((s) => {
    const v = new Map<string, number>();
    tokenize(s).forEach((w) => v.set(w, (v.get(w) || 0) + 1));
    return v;
  });
  const norms = vectors.map((v) => Math.sqrt([...v.values()].reduce((a, x) => a + x * x, 0)) || 1);
  const n = sentences.length;
  const weights = vectors.map((a, i) =>
    vectors.map((b, j) => {
      if (i === j) return 0;
      let dot = 0;
      for (const [w, x] of a) dot += x * (b.get(w) || 0);
      return dot / (norms[i] * norms[j]);
    })
  );
  const outSums = weights.map((row) => row.reduce((a, x) => a + x, 0) || 1);
  let scores = new Array(n).fill(1);
  for (let iter = 0; iter < 30; iter++) {
    scores = scores.map((_, i) => 0.15 + 0.85 * weights.reduce((acc, row, j) => acc + (row[i] / outSums[j]) * scores[j], 0));
  }
  const final = scores.map((s, i) => s * (1 + 0.6 / (1 + i)) * (SIGNAL.test(sentences[i]) ? 1.3 : 1));
  return final
    .map((score, i) => ({ score, i }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.i - b.i)
    .map(({ i }) => sentences[i]);
}

const REF_RE = /\b(?:CP|PS|SS|DP|CR)\d{1,2}\/\d{2}\b|\bRelease No\. [\w-]+|\bFile No\. [\w-]+|\b(?:Consultation Paper|Policy Statement) No\. [\w/-]+/g;

export function summarize(text: string, options: { datesText?: string; sourceUrl?: string; now?: Date } = {}): KeyPoints {
  const now = options.now || new Date();
  const sentences = splitSentences(text).slice(0, 120);
  const points = rankSentences(sentences, 3);
  const dateSentences = options.datesText ? splitSentences(options.datesText) : sentences;
  const facts = extractDateFacts(dateSentences, now);
  const refs = [...new Set(text.match(REF_RE) || [])].slice(0, 5);
  const dates = documentDates(options.datesText ? [...dateSentences, ...sentences] : sentences).slice(0, 6);
  return { points, facts, refs, ...(dates.length ? { dates } : {}), sourceUrl: options.sourceUrl, method: 'extractive' };
}

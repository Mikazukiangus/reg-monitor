// Extractive summaries for regulatory documents. No model or external API:
// every key point is a sentence quoted verbatim from the source document, and
// key facts (deadlines, references) are pulled out with rules.
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { extractText, getDocumentProxy } from 'unpdf';

export interface KeyFact {
  text: string;
  // ISO date (YYYY-MM-DD) when the sentence names a full calendar date
  date?: string;
}

export interface KeyPoints {
  points: string[];
  facts: KeyFact[];
  refs: string[];
  sourceUrl?: string;
  method: 'extractive';
}

const BLOCK_CLOSE = /<\/(p|li|h[1-6]|div|tr|td|th|section|article|blockquote|dd|dt)>|<br\s*\/?>/gi;

// HTML to plain text with paragraph breaks preserved, so headings and list
// items don't run into the following sentence.
function htmlToText(html: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${html.replace(BLOCK_CLOSE, '$&\n')}</body></html>`);
  const lines = (document.body.textContent || '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  // A line starting mid-sentence (lowercase or punctuation) continues the previous one
  const merged: string[] = [];
  for (const line of lines) {
    if (merged.length > 0 && /^[,.;:)\]a-z]/.test(line)) {
      merged[merged.length - 1] += (/^[,.;:)\]]/.test(line) ? '' : ' ') + line;
    } else {
      merged.push(line);
    }
  }
  return merged.join('\n');
}

// Pull the main article text out of a regulator's web page
export function extractArticleText(html: string, url: string): string {
  const { document } = parseHTML(html);
  // Bank of England pages: Readability picks up the cookie banner
  if (url.includes('bankofengland.co.uk')) {
    const main = document.querySelector('.page-content');
    if (main) return htmlToText(main.innerHTML);
  }
  const article = new Readability(document as unknown as Document).parse();
  return article?.content ? htmlToText(article.content) : '';
}

// Letter furniture in regulator circulars: letterhead, salutations, sign-off,
// contact details, page markers, and lines in Chinese
const PDF_BOILERPLATE = /^(?:-\s*\d+\s*-|page \d+(?: of \d+)?|our ref\b|your ref\b|dear\b|yours (?:faithfully|sincerely)|encl\b|website:|tel:|fax:|e-?mail:)|\d+(?:st|nd|rd|th) floor|[\u3000-\u9fff]/i;
const LIST_MARKER = /^(?:\d{1,2}\.|\([a-z0-9]{1,4}\)|[a-z]\)|[•▪●–-])\s+/i;
const CONTACT_LINE = /please (?:feel free to )?contact|\b\d{4} \d{4}\b/i;

// Subject lines and headings: no closing punctuation, mostly capitalised words
function isTitleLike(line: string): boolean {
  if (/[.!?:;,]$/.test(line)) return false;
  const words = line.split(' ').filter((w) => w.length > 3);
  return words.length >= 2 && words.filter((w) => /^[A-Z“"(]/.test(w)).length / words.length >= 0.75;
}

// Rebuild paragraphs from PDF text lines. Lines that wrap mid-sentence are
// joined; short lines (headings, paragraph ends), list items, and removed
// boilerplate (e.g. "Dear Sir/Madam" before the subject line) start a new
// paragraph.
function pdfLinesToText(pages: string[]): string {
  const lines = pages
    .flatMap((page) => page.split('\n'))
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .map((l) => (PDF_BOILERPLATE.test(l) || CONTACT_LINE.test(l) ? null : l));
  const lengths = lines.flatMap((l) => (l ? [l.length] : [])).sort((a, b) => a - b);
  const typical = lengths[Math.floor(lengths.length * 0.8)] || 80;

  const paragraphs: string[] = [];
  let current = '';
  let prev = '';
  for (const raw of lines) {
    if (raw === null) {
      if (current) paragraphs.push(current);
      current = '';
      prev = '';
      continue;
    }
    const isListItem = LIST_MARKER.test(raw);
    const line = raw.replace(LIST_MARKER, '');
    // A line starting in lowercase always continues the sentence
    const continues = /^[a-z(]/.test(line) && !isListItem;
    const endsParagraph =
      prev.length < typical * 0.7 || isTitleLike(prev) || (/[.!?:]$/.test(prev) && /^[A-Z]/.test(line) && prev.length < typical * 0.9);
    const breakBefore = !current || isListItem || (!continues && endsParagraph);
    if (breakBefore) {
      if (current) paragraphs.push(current);
      current = line;
    } else {
      current += prev.endsWith('-') ? line : ' ' + line;
    }
    prev = raw;
  }
  if (current) paragraphs.push(current);
  // Drop footnotes ("1 The review followed...") and footnote markers glued to
  // words or closing quotes, e.g. ("ECF").1
  return paragraphs
    .filter((p) => !/^\d{1,2} [A-Z]/.test(p))
    .map((p) => p.replace(/([a-z)”"’])\.(\d{1,2})(?=\s|$)/g, '$1.')).join('\n');
}

// Plain text of a PDF document, as paragraphs
export async function extractPdfText(data: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  return pdfLinesToText(text as string[]);
}

const STOP = new Set(
  'the of and to a in for on by with is are be that this as at from or an its it their will has have was were which under also into these those such than other any all may can not more been our we they them there its'.split(' ')
);
const SIGNAL = /\b(must|requires?|required|requirements?|deadline|effective|consult\w*|feedback|comments?|propos\w*|implement\w*|penalt\w*|fines?|enforce\w*|guidance|guidelines?|rules?|standards?)\b/i;

// Press-release datelines ("Singapore, 1 October 2026… ") and footnote markers
const DATELINE = /^[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?, \d{1,2} [A-Z][a-z]+ 20\d\d\s*(?:…|\.\.\.|-|–|—)\s*/;
const FOOTNOTE = /^\d{1,2}\s+(?=[A-Z])/;
const PHOTO_CAPTION = /\((?:left|right|centre|center|middle)\)/i;

function splitSentences(text: string): string[] {
  return text
    .split('\n')
    .flatMap((para) => para.split(/(?<=[.!?])\s+(?=[A-Z“"(])/))
    .map((s) => s.trim().replace(DATELINE, '').replace(FOOTNOTE, ''))
    .filter((s) => s.length >= 40 && s.length <= 400 && /^[A-Z“"(]/.test(s) && /[.!?:]$/.test(s) && !PHOTO_CAPTION.test(s));
}

function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z-]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
}

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

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = 'January|February|March|April|May|June|July|August|September|October|November|December';
const FULL_DATE = new RegExp(`\\b(\\d{1,2}) (${MONTH_RE}) (20\\d\\d)\\b|\\b(${MONTH_RE}) (\\d{1,2}),? (20\\d\\d)\\b`, 'g');
const ANY_DATE = new RegExp(`\\b(?:\\d{1,2} )?(?:${MONTH_RE})(?: \\d{1,2},?)? 20\\d\\d\\b`);
const MONTH_YEAR = new RegExp(`\\b(${MONTH_RE}) (20\\d\\d)\\b`, 'g');
const DEADLINE_CUE = /\b(by|before|until|no later than|deadline|close[sd]?|due|submit\w*|comments?|feedback|responses?|effective|take[s]? effect|come[s]? into (?:force|effect)|apply|applies|commence\w*|implement\w*)\b/i;

function parseFullDates(sentence: string): string[] {
  const dates: string[] = [];
  for (const m of sentence.matchAll(FULL_DATE)) {
    const [day, month, year] = m[1] ? [m[1], m[2], m[3]] : [m[5], m[4], m[6]];
    const mm = String(MONTHS.indexOf(month.toLowerCase()) + 1).padStart(2, '0');
    dates.push(`${year}-${mm}-${day.padStart(2, '0')}`);
  }
  return dates;
}

// Share of the shorter sentence's words that also appear in the other
function overlap(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  const shared = [...ta].filter((w) => tb.has(w)).length;
  return shared / (Math.min(ta.size, tb.size) || 1);
}

// Sentences that tie a date to an action (comments due, takes effect, ...).
// Upcoming dates are preferred over historical ones.
function extractDateFacts(sentences: string[], now: Date): KeyFact[] {
  const today = now.toISOString().slice(0, 10);
  const facts: (KeyFact & { future: boolean })[] = [];
  for (const s of sentences) {
    if (!ANY_DATE.test(s) || !DEADLINE_CUE.test(s)) continue;
    const fullDates = parseFullDates(s);
    const futureDates = fullDates.filter((d) => d >= today).sort();
    // Month-only dates ("by April 2027") count if that month hasn't passed
    const thisMonth = today.slice(0, 7);
    const futureMonths = [...s.matchAll(MONTH_YEAR)]
      .map((m) => `${m[2]}-${String(MONTHS.indexOf(m[1].toLowerCase()) + 1).padStart(2, '0')}`)
      .filter((ym) => ym >= thisMonth && !fullDates.some((d) => d.startsWith(ym)));
    facts.push({ text: s, date: futureDates[0], future: futureDates.length > 0 || futureMonths.length > 0 });
  }
  const kept: KeyFact[] = [];
  for (const { text, date, future } of facts) {
    if (!future || kept.some((k) => overlap(k.text, text) > 0.6)) continue;
    kept.push(date ? { text, date } : { text });
    if (kept.length === 3) break;
  }
  return kept;
}

const REF_RE = /\b(?:CP|PS|SS|DP|CR)\d{1,2}\/\d{2}\b|\bRelease No\. [\w-]+|\bFile No\. [\w-]+|\b(?:Consultation Paper|Policy Statement) No\. [\w/-]+/g;

export function summarize(text: string, options: { datesText?: string; sourceUrl?: string; now?: Date } = {}): KeyPoints {
  const now = options.now || new Date();
  const sentences = splitSentences(text).slice(0, 120);
  const points = rankSentences(sentences, 3);
  const dateSentences = options.datesText ? splitSentences(options.datesText) : sentences;
  const facts = extractDateFacts(dateSentences, now);
  const refs = [...new Set(text.match(REF_RE) || [])].slice(0, 5);
  return { points, facts, refs, sourceUrl: options.sourceUrl, method: 'extractive' };
}

// Earliest upcoming deadline named in the facts, if any
export function earliestDeadline(keyPoints: KeyPoints): KeyFact | undefined {
  return keyPoints.facts.filter((f) => f.date).sort((a, b) => (a.date! < b.date! ? -1 : 1))[0];
}

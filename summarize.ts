// Extractive summaries for regulatory documents. No generative model or
// external API: every key point is a sentence quoted verbatim from the source
// document, and key facts (deadlines, references) are pulled out with rules.
// Scanned PDFs are read with Tesseract OCR first.
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { extractImages, extractText, getDocumentProxy } from 'unpdf';

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
  // Text was read from a scanned PDF by OCR, so quotes may contain recognition errors
  ocr?: boolean;
  // Dates the document states for itself, each with its kind and sentence
  dates?: DocumentDate[];
  // Copies stored before October 2026 have this instead of dates
  closingDate?: KeyFact;
}

export type DateKind = 'closes' | 'takesEffect' | 'complyBy';

// A date a document states for itself: when comments close, when it takes
// effect, or when firms must comply by
export interface DocumentDate {
  kind: DateKind;
  // ISO date (YYYY-MM-DD)
  date: string;
  // The sentence it comes from, verbatim
  text: string;
  // "The consultation closes on ..." rather than a request for comments.
  // Counts only on a consultation: a digest or event notice may be quoting
  // another paper's closing date.
  general?: boolean;
}

const BLOCK_CLOSE = /<\/(p|li|h[1-6]|div|tr|td|th|section|article|blockquote|dd|dt)>|<br\s*\/?>/gi;

// HTML to plain text with paragraph breaks preserved, so headings and list
// items don't run into the following sentence.
export function htmlToText(html: string): string {
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
  // gov.cn documents: Readability fails on the policy library's page layout
  if (url.includes('www.gov.cn')) {
    const main = document.querySelector('#UCAP-CONTENT');
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
// Footnotes sit at the bottom of a page: "1 The review followed..." (OCR often
// reads the superscript as "!"). Dates such as "7 September 2026" are not footnotes.
const FOOTNOTE_START =
  /^(?:\d{1,2}|[!¹²³])\s+(?!(?:January|February|March|April|May|June|July|August|September|October|November|December)\b)[A-Z“"]/;
const PAGE_BREAK = '\f';

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
  // Keep page breaks so a footnote only runs to the end of its page
  const lines: (string | null)[] = [];
  let inFootnote = false;
  for (const page of pages) {
    for (const raw of page.split('\n')) {
      const l = raw.replace(/\s+/g, ' ').trim();
      if (!l) continue;
      if (FOOTNOTE_START.test(l)) inFootnote = true;
      if (inFootnote) continue;
      lines.push(PDF_BOILERPLATE.test(l) || CONTACT_LINE.test(l) ? null : l);
    }
    inFootnote = false;
    lines.push(PAGE_BREAK);
  }
  const lengths = lines.flatMap((l) => (l && l !== PAGE_BREAK ? [l.length] : [])).sort((a, b) => a - b);
  const typical = lengths[Math.floor(lengths.length * 0.8)] || 80;

  const paragraphs: string[] = [];
  let current = '';
  let prev = '';
  for (const raw of lines) {
    if (raw === PAGE_BREAK) continue;
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
  // Drop footnote markers glued to words or closing quotes, e.g. ("ECF").1 or
  // website.! from OCR
  return paragraphs.map((p) => p.replace(/([a-z)”"’])\.(?:\d{1,2}|[!¹²³])(?=\s|$)/g, '$1.')).join('\n');
}

// Scanned PDFs have no text layer. Their pages are read with Tesseract OCR,
// using the English data bundled in @tesseract.js-data/eng (no download).
const OCR_MAX_PAGES = 4;
const require = createRequire(import.meta.url);
const OCR_LANG_PATH = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

async function ocrPdfPages(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string[]> {
  const { createWorker } = (await import('tesseract.js')).default;
  const worker = await createWorker('eng', 1, { langPath: OCR_LANG_PATH, cacheMethod: 'none', gzip: true });
  try {
    const pages: string[] = [];
    for (let p = 1; p <= Math.min(pdf.numPages, OCR_MAX_PAGES); p++) {
      // A scanned page is one full-page image; take the largest
      const images = await extractImages(pdf, p);
      const img = images.sort((a, b) => b.width * b.height - a.width * a.height)[0];
      if (!img) continue;
      // Grayscale PGM, which Tesseract reads directly
      const gray = new Uint8Array(img.width * img.height);
      for (let i = 0, j = 0; i < gray.length; i++, j += img.channels) {
        gray[i] = img.channels >= 3 ? (img.data[j] * 299 + img.data[j + 1] * 587 + img.data[j + 2] * 114) / 1000 : img.data[j];
      }
      const pgm = Buffer.concat([Buffer.from(`P5\n${img.width} ${img.height}\n255\n`), Buffer.from(gray)]);
      pages.push((await worker.recognize(pgm)).data.text);
    }
    return pages;
  } finally {
    await worker.terminate();
  }
}

// Plain text of a PDF document, as paragraphs. Falls back to OCR when the PDF
// has no text layer.
export async function extractPdfText(data: Uint8Array): Promise<{ text: string; ocr: boolean }> {
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = text as string[];
  if (pages.join('').trim().length >= 200) {
    return { text: pdfLinesToText(pages), ocr: false };
  }
  return { text: pdfLinesToText(await ocrPdfPages(pdf)), ocr: true };
}

const STOP = new Set(
  'the of and to a in for on by with is are be that this as at from or an its it their will has have was were which under also into these those such than other any all may can not more been our we they them there its'.split(' ')
);
const SIGNAL = /\b(must|requires?|required|requirements?|deadline|effective|consult\w*|feedback|comments?|propos\w*|implement\w*|penalt\w*|fines?|enforce\w*|guidance|guidelines?|rules?|standards?)\b/i;

// Press-release datelines ("Singapore, 1 October 2026… ") and footnote markers
const DATELINE = /^[A-Z][A-Za-z]+(?: [A-Z][A-Za-z]+)?, \d{1,2} [A-Z][a-z]+ 20\d\d\s*(?:…|\.\.\.|-|–|—)\s*/;
const FOOTNOTE = /^\d{1,2}\s+(?=[A-Z])/;
const PHOTO_CAPTION = /\((?:left|right|centre|center|middle)\)/i;

// Chinese and Japanese characters. Their sentences end in "。" and need no
// space after it; a character carries more meaning, so they may be shorter.
const CJK_RUN = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]+/g;
const CJK_START = /^[《“（\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/;

const isLatinSentence = (s: string) => s.length >= 40 && s.length <= 400 && /^[A-Z“"(]/.test(s) && /[.!?:]$/.test(s) && !PHOTO_CAPTION.test(s);
const isCjkSentence = (s: string) => s.length >= 15 && s.length <= 300 && CJK_START.test(s) && /[。！？]$/.test(s);

function splitSentences(text: string): string[] {
  return text
    .split('\n')
    .flatMap((para) => para.split(/(?<=[.!?])\s+(?=[A-Z“"(])|(?<=[。！？])/))
    .map((s) => s.trim().replace(DATELINE, '').replace(FOOTNOTE, ''))
    .filter((s) => isLatinSentence(s) || isCjkSentence(s));
}

// Words, and for Chinese and Japanese text each pair of adjacent characters
function tokenize(s: string): string[] {
  const words = (s.toLowerCase().match(/[a-z][a-z-]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
  const pairs = (s.match(CJK_RUN) || []).flatMap((run) => Array.from({ length: run.length - 1 }, (_, i) => run.slice(i, i + 2)));
  return [...words, ...pairs];
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
const DAY_RE = String.raw`(\d{1,2})(?:st|nd|rd|th)?`;
const FULL_DATE = new RegExp(`\\b${DAY_RE} (${MONTH_RE}),? (20\\d\\d)\\b|\\b(${MONTH_RE}) ${DAY_RE},? (20\\d\\d)\\b`, 'g');
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

// Dates a document states for itself. Each kind needs its cue right before the
// date ("comments ... by 9 December 2026", "will take effect on 1 November
// 2026"), so another date in the same sentence is not taken for it.
const DATE_TEXT = String.raw`(?:\d{1,2}(?:st|nd|rd|th)? (?:${MONTH_RE}),? 20\d\d|(?:${MONTH_RE}) \d{1,2}(?:st|nd|rd|th)?,? 20\d\d)`;
// Within one clause; dots inside e-mail addresses and times are allowed
const IN_CLAUSE = String.raw`(?:[^.;]|\.(?=\S))`;
// Words between a cue and its date, as in "by 5pm (AEDT) on Thursday, 5 November
// 2026" or "beginning on or after 1 January 2028"
const TIME = String.raw`(?:at )?(?:\d{1,2}(?:[.:]\d{2})?\s?(?:am|pm|a\.m\.|p\.m\.)|noon|midnight)(?: \([A-Za-z ]+\))?,? `;
const TO_DATE = String.raw`,?\s+(?:(?:on or after|on|from|as (?:of|from)|is|was|will be)\s+)?(?:${TIME})?(?:on )?` +
  String.raw`(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),? )?(?:the )?(${DATE_TEXT})`;
const withDate = (cue: string) => new RegExp(`(?:${cue})${TO_DATE}`, 'i');

// A request for comments: "Comments should be submitted on or before ...",
// "Stakeholders are invited to respond to the consultation by ..."
const ASKS_FOR_COMMENTS = withDate(
  String.raw`\b(?:comments?|respond|responses?|feedback|submissions?|submitted|views|representations)\b${IN_CLAUSE}{0,140}?\b(?:by|on or before|no later than|before|until)`
);
// A statement of when comments close: "The consultation closes on ...", "The
// consultation period ends on ...", "... will last until ..."
const STATES_CLOSING = withDate([
  String.raw`\b(?:consultation|consultation period|comment period|consultation paper|submissions?|comments?)\b${IN_CLAUSE}{0,80}?\b(?:closes?|closed|closing|ends?|ended|will end|runs? until|ran until|lasts? until|will (?:last|run|remain open|be open) until|(?:is|remains) open until)`,
  String.raw`\bclosing date\b${IN_CLAUSE}{0,80}?\b(?:is|was|of)`,
  String.raw`\bdeadline for (?:responses|comments|submissions|feedback)\b${IN_CLAUSE}{0,60}?\b(?:is|was)`
].join('|'));
const THIS_DOCUMENT = /\bthis (?:consultation|paper|consultation paper|document|notice|request)\b|\btoday\b/i;
// "will take effect on ...", "become effective on ...", "The effective date of
// the amendments ... is ...", "shall apply on ...", "take effect for annual
// reporting periods beginning on or after ..."
const TAKES_EFFECT = withDate([
  String.raw`\b(?:takes?|took|taking) effect(?: for${IN_CLAUSE}{0,60}?\b(?:beginning|starting|commencing))?`,
  String.raw`\bbecomes? effective`,
  String.raw`\b(?:comes?|came|coming) into (?:force|effect|operation)`,
  String.raw`\beffective(?= (?:on|from|as (?:of|from)) )`,
  String.raw`\bwith effect from`,
  String.raw`\beffective date\b${IN_CLAUSE}{0,80}?\b(?:is|will be|was)`,
  String.raw`\b(?:shall|will) (?:apply|commence|start)`,
  String.raw`\bcommences?`
].join('|'));
// An obligation with a date: "should have ... in place by ...", "are required to
// be completed by ..."
const COMPLY_BY = withDate(
  String.raw`\b(?:must|should|shall|(?:is|are) required to|required to be|needs? to|ha(?:ve|s) to)\b${IN_CLAUSE}{0,120}?\b(?:by|no later than|on or before)`
);
// Effective and compliance dates that are not settled: proposals, conditions,
// views on a proposed date
const UNSETTLED = /\b(?:propos(?:ed?|es|als?)|would|could|might|if|subject to|differing views|expected to|intends? to|plans? to|aims? to)\b/i;
// A date being replaced: "from 1 January 2028, instead of 1 January 2027"
const REPLACED_DATE = new RegExp(`,?\\s*\\b(?:instead of|rather than|replacing|previously|originally)\\s+(?:the\\s+)?${DATE_TEXT}`, 'gi');

// Chinese rules state their dates in a set form: "本办法自2026年7月15日起施行"
// (these measures take effect from ...), and a call for comments
// "意见反馈截止时间为2026年10月18日" (feedback closes on ...). A draft's
// date is only proposed.
const CJK_DATE = String.raw`(20\d\d)年(\d{1,2})月(\d{1,2})日`;
const CJK_TAKES_EFFECT = new RegExp(`自${CJK_DATE}起(?:施行|实施|执行|生效)`);
const CJK_CLOSES = new RegExp(`(?:反馈|意见)[^。]{0,20}?截止(?:时间|日期)?(?:为|是|至)?${CJK_DATE}`);
const CJK_DRAFT = /征求意见稿|草案/;
const cjkIso = (m: RegExpMatchArray) => `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
// Japanese calls for comments: "令和８年６月19日（金）から令和８年６月23日（火）
// までの間、意見を募集します" (comments are invited from ... until ...). Year N of
// the Reiwa era is 2018 + N; digits may be full-width.
const JA_CLOSES = /(?:令和(\d{1,2})|(20\d\d))年(\d{1,2})月(\d{1,2})日(?:（.）)?までの間[^。]{0,10}意見を募集/;
const halfWidth = (s: string) => s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
const jaIso = (m: RegExpMatchArray) => `${m[1] ? 2018 + Number(m[1]) : m[2]}-${m[3].padStart(2, '0')}-${m[4].padStart(2, '0')}`;

// Each sentence that states a date for the document it comes from, with the
// kind of date. Takes the sentences in document order; one date per sentence.
export function documentDates(sentences: string[]): DocumentDate[] {
  const found: DocumentDate[] = [];
  for (const text of new Set(sentences)) {
    const jaCloses = halfWidth(text).match(JA_CLOSES);
    if (jaCloses) {
      found.push({ kind: 'closes', date: jaIso(jaCloses), text });
      continue;
    }
    const cjkCloses = text.match(CJK_CLOSES);
    const cjkEffect = cjkCloses || CJK_DRAFT.test(text) ? null : text.match(CJK_TAKES_EFFECT);
    if (cjkCloses || cjkEffect) {
      found.push({ kind: cjkCloses ? 'closes' : 'takesEffect', date: cjkIso((cjkCloses || cjkEffect)!), text });
      continue;
    }
    const s = text.replace(REPLACED_DATE, '');
    const asks = s.match(ASKS_FOR_COMMENTS);
    const states = asks ? null : s.match(STATES_CLOSING);
    const settled = !asks && !states && !UNSETTLED.test(s);
    const effect = settled ? s.match(TAKES_EFFECT) : null;
    const comply = settled && !effect ? s.match(COMPLY_BY) : null;
    const m = asks || states || effect || comply;
    const date = m && parseFullDates(m[1])[0];
    if (!date) continue;
    const kind: DateKind = effect ? 'takesEffect' : comply ? 'complyBy' : 'closes';
    found.push({ kind, date, text, ...(states && !THIS_DOCUMENT.test(s) ? { general: true } : {}) });
  }
  return found;
}

// The first closing date in the sentences, e.g. "Written submissions are
// requested by 30 October 2026"
export function extractClosingDate(sentences: string[]): KeyFact | undefined {
  const closes = documentDates(sentences).find((d) => d.kind === 'closes');
  return closes && { text: closes.text, date: closes.date };
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

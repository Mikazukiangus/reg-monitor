// The text of a regulator's document: the article of a web page (with the
// date the page says it was published), or the paragraphs of a PDF. Scanned
// PDFs are read with Tesseract OCR.
import { createRequire } from 'node:module';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { extractImages, extractText, getDocumentProxy } from 'unpdf';

const BLOCK_CLOSE = /<\/(p|li|h[1-6]|div|tr|td|th|section|article|blockquote|dd|dt)>|<br\s*\/?>/gi;

// When a web page says it was published, from the metadata pages commonly
// carry (Open Graph, Dublin Core, schema.org) or a "First published:
// DD/MM/YYYY" line as on UK government sites. Undefined when there is none or
// the date is not plausible.
const PUBLISHED_META = [
  /<meta[^>]+(?:property|name)=["'](?:article:published_time|og:published_time|datePublished|dcterms\.(?:created|issued|date)|DC\.date(?:\.issued)?|publish[-_]?date|pubdate)["'][^>]*>/i
];
const ISO_START = /^(20\d\d-\d\d-\d\d)(T\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:?\d\d)?)?/;
export function pagePublishedDate(html: string, now = new Date()): string | undefined {
  const candidates: string[] = [];
  for (const re of PUBLISHED_META) {
    const tag = html.match(re)?.[0];
    const content = tag?.match(/content=["']([^"']+)["']/i)?.[1];
    if (content) candidates.push(content.trim());
  }
  const ld = html.match(/"datePublished"\s*:\s*"([^"]+)"/)?.[1];
  if (ld) candidates.push(ld.trim());
  const first = htmlToText(html).match(/\bFirst published:?\s*(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/i);
  if (first) candidates.push(`${first[3]}-${first[2].padStart(2, '0')}-${first[1].padStart(2, '0')}`);
  for (const c of candidates) {
    const m = c.match(ISO_START);
    if (!m) continue;
    const day = m[1];
    const time = m[2] && !isNaN(new Date(c.slice(0, m[0].length)).getTime()) ? new Date(c.slice(0, m[0].length)).toISOString() : undefined;
    if (isNaN(new Date(`${day}T00:00:00Z`).getTime()) || new Date(`${day}T00:00:00Z`).getTime() > now.getTime() + 36 * 3600e3) continue;
    return time ?? day;
  }
  return undefined;
}

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
export const OCR_LANG_PATH = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');

// A Tesseract worker for English. The engine and model files it loads are
// listed in vercel.json's includeFiles (tests/bundle.test.ts checks them).
export async function createOcrWorker() {
  const { createWorker } = (await import('tesseract.js')).default;
  return createWorker('eng', 1, { langPath: OCR_LANG_PATH, cacheMethod: 'none', gzip: true });
}

async function ocrPdfPages(pdf: Awaited<ReturnType<typeof getDocumentProxy>>): Promise<string[]> {
  const worker = await createOcrWorker();
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

// Limits on reading a PDF, so one unusual document cannot use up the
// function's time or memory. Both are well above what the sources publish (in
// October 2026 the longest was 471 pages, and scanned HKMA pages are 8.7
// megapixel images). A longer PDF gets no key points rather than key points
// from part of it; a larger image is skipped, so OCR finds no text on it.
export const PDF_LIMITS = { maxPages: 1000, maxImagePixels: 40_000_000 };

// Plain text of a PDF document, as paragraphs. Falls back to OCR when the PDF
// has no text layer. The document is closed once reading has finished.
export async function extractPdfText(data: Uint8Array, limits = PDF_LIMITS): Promise<{ text: string; ocr: boolean }> {
  const pdf = await getDocumentProxy(data, { maxImageSize: limits.maxImagePixels });
  try {
    if (pdf.numPages > limits.maxPages) throw new Error(`PDF too long (${pdf.numPages} pages, limit ${limits.maxPages})`);
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = text as string[];
    if (pages.join('').trim().length >= 200) {
      return { text: pdfLinesToText(pages), ocr: false };
    }
    return { text: pdfLinesToText(await ocrPdfPages(pdf)), ocr: true };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

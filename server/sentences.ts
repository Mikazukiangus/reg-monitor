// Sentences of a document's text (English, Chinese or Japanese), and the
// words that compare them

const STOP = new Set(
  'the of and to a in for on by with is are be that this as at from or an its it their will has have was were which under also into these those such than other any all may can not more been our we they them there its'.split(' ')
);

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

export function splitSentences(text: string): string[] {
  return text
    .split('\n')
    .flatMap((para) => para.split(/(?<=[.!?])\s+(?=[A-Z“"(])|(?<=[。！？])/))
    .map((s) => s.trim().replace(DATELINE, '').replace(FOOTNOTE, ''))
    .filter((s) => isLatinSentence(s) || isCjkSentence(s));
}

// Words, and for Chinese and Japanese text each pair of adjacent characters
export function tokenize(s: string): string[] {
  const words = (s.toLowerCase().match(/[a-z][a-z-]+/g) || []).filter((w) => w.length > 2 && !STOP.has(w));
  const pairs = (s.match(CJK_RUN) || []).flatMap((run) => Array.from({ length: run.length - 1 }, (_, i) => run.slice(i, i + 2)));
  return [...words, ...pairs];
}

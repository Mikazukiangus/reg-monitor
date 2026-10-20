// Dates a document states for itself, found by rules: when comments close,
// when it takes effect, when firms must comply, and dated statements
import type { DateKind, DocumentDate, KeyFact } from '../shared/regulatory.js';
import { tokenize } from './sentences.js';

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
export function extractDateFacts(sentences: string[], now: Date): KeyFact[] {
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
  String.raw`\b(?:comments?|respond|responses?|feedback|submissions?|submitted|views|representations|contributions)\b${IN_CLAUSE}{0,140}?\b(?:by|on or before|no later than|before|until)`
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

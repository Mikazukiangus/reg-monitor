// Shared by filtering and highlighting, so visible matches follow the same rules.
// Chinese, Japanese and Korean terms can occur inside text without spaces.
const UNSEGMENTED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export const searchTerms = (query: string) => query.split(/\s+/).filter(w => w.length > 1);

export function createSearchPattern(terms: readonly string[], global = false): RegExp {
  const alternatives = terms.map(term => term.trim()).filter(term => term.length > 1).map(term => {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Keep word-prefix matching for spaced scripts, including accented words.
    return UNSEGMENTED_SCRIPT.test(term) ? escaped : `(?<![\\p{L}\\p{M}\\p{N}_])${escaped}`;
  });
  return new RegExp(alternatives.length ? `(${alternatives.join('|')})` : '(?!)', global ? 'giu' : 'iu');
}

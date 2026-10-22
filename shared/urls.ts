// The links shown with a notice come from regulators' pages and feeds, so
// only web links over HTTPS are kept: a regulator's plain-HTTP link is
// upgraded, as the browser upgrades a page's own requests
// (upgrade-insecure-requests in vercel.json), and anything else (javascript:,
// data:, a malformed address) is dropped rather than shown as a link.
export const httpsUrl = (url: string) => url.replace(/^http:\/\//i, 'https://');

// The link over HTTPS, or undefined when it is not a web link. The text is
// kept as the regulator wrote it (not re-encoded by the URL parser); control
// characters, which the parser would quietly drop, are refused instead, so a
// link cannot hide a scheme ("java\tscript:") or break a line in an export.
export function safeUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  const upgraded = httpsUrl(url.trim());
  if (/[\u0000-\u001f\u007f]/.test(upgraded)) return undefined;
  try {
    return new URL(upgraded).protocol === 'https:' ? upgraded : undefined;
  } catch {
    return undefined;
  }
}

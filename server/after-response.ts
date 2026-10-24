// Vercel keeps a function running after its response for promises given to
// the request context's waitUntil. This is what @vercel/functions' waitUntil
// calls, read directly rather than adding that package and its two dozen
// dependencies for six lines. Elsewhere (a local server) the work just runs on.
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');
export function afterResponse(work: Promise<unknown>): void {
  const context = (globalThis as any)[REQUEST_CONTEXT]?.get?.();
  context?.waitUntil?.(work);
}

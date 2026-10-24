// The page's side of error tracking: reports of its own errors
// (src/lib/errorReporting.ts) and the screen shown when rendering fails
// (src/components/ErrorBoundary.tsx)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const sent: { url: string; init: RequestInit }[] = [];
(globalThis as any).location = { pathname: '/feed', search: '?q=private', hash: '#notice-1' };
globalThis.fetch = (async (url: string, init: RequestInit) => {
  sent.push({ url, init });
  return new Response(JSON.stringify({ success: true, reference: 'ABCDEF0123' }), { headers: { 'content-type': 'application/json' } });
}) as typeof fetch;
const { reportError } = await import('../src/lib/errorReporting.ts');
const { ErrorBoundary } = await import('../src/components/ErrorBoundary.tsx');

test('an error is reported once, redacted, with the page path alone', async () => {
  const error = new TypeError('Lookup failed for https://api.example/x?token=s3cr3t-value-123');
  assert.equal(await reportError(error, 'render'), 'ABCDEF0123');
  assert.equal(await reportError(error, 'render'), null, 'the same error again is not sent');
  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, '/api/errors');
  assert.equal(sent[0].init.method, 'POST');
  const body = JSON.parse(sent[0].init.body as string);
  assert.deepEqual(Object.keys(body).sort(), ['message', 'name', 'path', 'stack', 'where']);
  assert.equal(body.path, '/feed');
  assert.equal(body.name, 'TypeError');
  assert.ok(!JSON.stringify(body).includes('s3cr3t'));
  // One frame a line, as the server reads them
  assert.ok(body.stack.split('\n').length > 2);
  assert.match(body.stack.split('\n')[1], /^\s+at /);
});

test('at most a few reports per page load', async () => {
  for (let i = 0; i < 10; i++) await reportError(new Error(`Error ${i}`), 'window');
  assert.equal(sent.length, 5);
});

test('when rendering fails the visitor sees a fixed message and the reference, never the error', () => {
  const boundary = new ErrorBoundary({ children: null });
  boundary.state = { failed: true, reference: 'ABCDEF0123' };
  const html = renderToStaticMarkup(boundary.render() as React.ReactElement);
  assert.match(html, /Something went wrong/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Reference <span[^>]*>ABCDEF0123<\/span>/);
  assert.match(html, />Reload<\/button>/);
  // Before the reference arrives, no reference line
  boundary.state = { failed: true, reference: null };
  assert.doesNotMatch(renderToStaticMarkup(boundary.render() as React.ReactElement), /Reference/);
});

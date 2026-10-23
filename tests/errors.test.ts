// What visitors are told when something fails (server/errors.ts): messages
// written for them pass, anything else is a fixed message with the detail in
// the log; scheduled-job refusals don't say why a job is off
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'net';

// A secret that is set but too short, which the reply must not reveal
process.env.CRON_SECRET = 'short';
const { publicError, SourceError, UNEXPLAINED } = await import('../server/errors.ts');
const { InsecureUrlError, RateLimitedError } = await import('../server/http.ts');
const { BlockedAddressError } = await import('../server/ssrf.ts');
const { CircuitOpenError } = await import('../server/breaker.ts');
const { refreshSource } = await import('../server/ingest.ts');
const { createApp } = await import('../server/app.ts');

test('messages written for visitors are shown; anything else is not', () => {
  for (const err of [
    new SourceError('HTTP 404'), new InsecureUrlError('Refused a plain-HTTP address: http://x.gov'), new RateLimitedError('HTTP 429: rate limited by the site'),
    new BlockedAddressError('Refused x.gov: 10.0.0.1 is not a public internet address'), new CircuitOpenError('Not asked: x.gov failed 3 times in a row')
  ]) assert.equal(publicError(err), err.message);
  assert.equal(publicError(new DOMException('timed out', 'TimeoutError')), 'Timed out after 8s');
  assert.equal(publicError(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })), 'Network error: ECONNREFUSED');
  for (const err of [
    new Error('relation "notices" does not exist'), Object.assign(new Error('duplicate key value violates unique constraint "notices_pkey"'), { code: '23505' }),
    new TypeError("Cannot read properties of undefined (reading 'channel')"), new SyntaxError('Unexpected token \'<\', "<!DOCTYPE "... is not valid JSON'),
    'a string', null, undefined
  ]) assert.equal(publicError(err), UNEXPLAINED, String(err));
});

test("a source whose code fails shows a fixed message, not the exception's", async () => {
  const state = await refreshSource({
    id: 'broken', name: 'Broken source',
    fetch: async () => { throw new TypeError("Cannot read properties of undefined (reading 'items')"); }
  } as any);
  assert.equal(state.error, UNEXPLAINED);
  const blocked = await refreshSource({ id: 'blocked', name: 'Refused source', fetch: async () => { throw new SourceError('HTTP 403'); } } as any);
  assert.equal(blocked.error, 'HTTP 403');
});

test('a scheduled job turned off does not say why', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    for (const path of ['/api/feeds/poll', '/api/digest']) {
      const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { Authorization: 'Bearer short' } });
      assert.equal(res.status, 503);
      assert.deepEqual(await res.json(), { success: false, error: 'Scheduled jobs are unavailable' });
    }
  } finally {
    server.close();
  }
});

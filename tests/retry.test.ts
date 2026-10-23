// Retry with backoff (server/retry.ts), only where a repeat is safe: regulator
// reads (server/http.ts) and Resend sends with an idempotency key
// (server/mailer.ts). Pauses are shortened to 1 ms here.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.RETRY_BASE_DELAY_MS = '1';
const { backoffMs, retryAfterMs, isPassingNetworkError } = await import('../server/retry.ts');
const { politeFetch, fetchOrThrow } = await import('../server/http.ts');
const { sendWithResend } = await import('../server/mailer.ts');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// Answers each call with the next reply (a Response, or an error to throw)
function network(replies: (Response | Error)[]) {
  const calls: { url: string; init: any }[] = [];
  globalThis.fetch = (async (url: string, init: any) => {
    calls.push({ url, init });
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    if (reply instanceof Error) throw reply;
    return reply.clone();
  }) as typeof fetch;
  return calls;
}
const ok = (text = 'ok') => new Response(text, { status: 200 });
const status = (code: number, headers: Record<string, string> = {}) => new Response('', { status: code, headers });
const broken = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
let n = 0;
const site = () => `https://site${++n}.example.gov/feed`;

test('pauses grow threefold with jitter, and Retry-After is read in seconds or as a date', () => {
  assert.equal(backoffMs(2, 500, () => 0.5), 500);
  assert.equal(backoffMs(3, 500, () => 0.5), 1500);
  assert.equal(backoffMs(4, 500, () => 0.5), 4500);
  assert.equal(backoffMs(2, 500, () => 0), 250);
  assert.equal(backoffMs(2, 500, () => 0.999), 750);
  assert.equal(retryAfterMs('3'), 3000);
  assert.equal(retryAfterMs('Thu, 01 Jan 2026 00:00:10 GMT', Date.parse('2026-01-01T00:00:00Z')), 10_000);
  for (const header of [null, '', 'soon']) assert.equal(retryAfterMs(header), undefined);
});

test('only a broken connection or a brief name failure counts as passing', () => {
  for (const code of ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN', 'UND_ERR_SOCKET']) assert.ok(isPassingNetworkError(broken(code)), code);
  for (const code of ['ECONNREFUSED', 'ENOTFOUND', 'CERT_HAS_EXPIRED', 'UND_ERR_CONNECT_TIMEOUT']) assert.ok(!isPassingNetworkError(broken(code)), code);
  assert.ok(!isPassingNetworkError(new DOMException('timed out', 'TimeoutError')));
  assert.ok(!isPassingNetworkError(new Error('anything else')));
});

test('a regulator read is tried again after a gateway error or a dropped connection', async () => {
  let calls = network([status(503), ok('feed')]);
  assert.equal(await (await politeFetch(site())).text(), 'feed');
  assert.equal(calls.length, 2);

  calls = network([broken('ECONNRESET'), status(502), ok('feed')]);
  assert.equal(await (await politeFetch(site())).text(), 'feed');
  assert.equal(calls.length, 3);

  // Three tries at most; the last answer is the one reported
  calls = network([status(504)]);
  await assert.rejects(fetchOrThrow(site()), /HTTP 504/);
  assert.equal(calls.length, 3);
});

test('a read is not tried again when another try would not help', async () => {
  for (const reply of [status(404), status(403), status(500), status(429), broken('ECONNREFUSED'), broken('ENOTFOUND'), new DOMException('timed out', 'TimeoutError')]) {
    const calls = network([reply, ok()]);
    const result = await politeFetch(site()).then(res => res.status, err => err.name);
    assert.notEqual(result, 200, String(reply));
    assert.equal(calls.length, 1, String(reply));
  }
  // A site that asks for a long wait is not waited for
  const calls = network([status(503, { 'Retry-After': '60' }), ok()]);
  assert.equal((await politeFetch(site())).status, 503);
  assert.equal(calls.length, 1);
});

test('a POST is tried again only when it is marked as a read', async () => {
  let calls = network([status(503), ok()]);
  assert.equal((await politeFetch(site(), { method: 'POST', body: '{}', contentType: 'application/json' })).status, 503);
  assert.equal(calls.length, 1);
  calls = network([status(503), ok()]);
  assert.equal((await politeFetch(site(), { method: 'POST', body: '{}', contentType: 'application/json', readOnly: true })).status, 200);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.body, '{}');
});

const mail = { apiKey: 're_test', from: 'RegSonar <digest@example.com>', to: ['owner@example.com'], subject: 'Digest', html: '<p>Hi</p>', text: 'Hi' };
const resend = (code: number, body: object = {}) => new Response(JSON.stringify(body), { status: code, headers: { 'content-type': 'application/json' } });

test('a digest send is tried again with the same idempotency key, so it is sent at most once', async () => {
  let calls = network([resend(500), new DOMException('timed out', 'TimeoutError'), resend(200, { id: 'email-1' })]);
  assert.deepEqual(await sendWithResend(mail), { id: 'email-1' });
  assert.equal(calls.length, 3);
  calls = network([resend(429, { 'Retry-After': '0' }), resend(409, { name: 'concurrent_idempotent_requests' }), resend(200, { id: 'email-2' })]);
  assert.deepEqual(await sendWithResend(mail), { id: 'email-2' });
  // RETRY_ATTEMPTS defaults to 3: after three failures the last is reported
  calls = network([resend(503), resend(503), resend(503), resend(200, { id: 'never' })]);
  await assert.rejects(sendWithResend(mail), /HTTP 503/);
  assert.equal(calls.length, 3);
});

test('every try of one send has the same key; separate sends have their own', async () => {
  let calls = network([resend(503), resend(200, { id: 'a' })]);
  await sendWithResend(mail);
  const keys = calls.map(c => c.init.headers['Idempotency-Key']);
  assert.equal(keys.length, 2);
  assert.match(keys[0], /^regsonar-digest\/[0-9a-f-]{36}$/);
  assert.equal(keys[0], keys[1]);
  calls = network([resend(200, { id: 'b' })]);
  await sendWithResend(mail);
  assert.notEqual(calls[0].init.headers['Idempotency-Key'], keys[0]);
});

test('a send Resend refuses is not tried again', async () => {
  for (const [code, body] of [[422, { message: 'Invalid from address' }], [401, {}], [409, { name: 'invalid_idempotent_request' }]] as const) {
    const calls = network([resend(code, body), resend(200, { id: 'x' })]);
    await assert.rejects(sendWithResend(mail), new RegExp(`HTTP ${code}`));
    assert.equal(calls.length, 1, String(code));
  }
});

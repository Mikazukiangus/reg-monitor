// Circuit breakers (server/breaker.ts) on regulator sites (server/http.ts)
// and the history database (server/db.ts)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

process.env.RETRY_BASE_DELAY_MS = '1';
const { CircuitBreaker, CircuitOpenError } = await import('../server/breaker.ts');
const { politeFetch, fetchOrThrow } = await import('../server/http.ts');
const { createConfig } = await import('../config.ts');

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

// Answers each call with the next reply (a Response, or an error to throw)
function network(replies: (Response | Error)[]) {
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    if (reply instanceof Error) throw reply;
    return reply.clone();
  }) as typeof fetch;
  return calls;
}
const ok = () => new Response('ok', { status: 200 });
const status = (code: number) => new Response('', { status: code });
const refused = () => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' }) });
const timedOut = () => new DOMException('timed out', 'TimeoutError');
let n = 0;
const host = () => `https://site${++n}.example.gov`;

const judge = { result: (r: string) => (r === 'bad' ? 'bad answer' : undefined), error: (err: any) => (err?.message === 'neutral' ? undefined : 'down') };
const fail = () => Promise.reject(new Error('down'));

test('settings default to 3 failures, 5 minutes for a site and 30 seconds for the database', () => {
  assert.deepEqual({ ...createConfig({}).breaker }, { failures: 3, siteCooldownMs: 300_000, databaseCooldownMs: 30_000 });
  assert.equal(createConfig({ BREAKER_FAILURES: '5' }).breaker.failures, 5);
  for (const [key, value] of [['BREAKER_FAILURES', '0'], ['SITE_BREAKER_COOLDOWN_MS', '10'], ['DB_BREAKER_COOLDOWN_MS', 'soon']]) {
    assert.throws(() => createConfig({ [key]: value }), new RegExp(key));
  }
});

test('opens after three failures in a row, refuses calls without making them, then lets one trial through', async () => {
  let now = 0;
  const breaker = new CircuitBreaker('Example', 3, 1000, () => now);
  let made = 0;
  const call = (outcome: () => Promise<string>) => breaker.run(() => { made++; return outcome(); }, judge);

  // A success in between starts the count again
  await assert.rejects(call(fail));
  await assert.rejects(call(fail));
  assert.equal(await call(async () => 'fine'), 'fine');
  await assert.rejects(call(fail));
  await assert.rejects(call(fail));
  assert.equal(await call(async () => 'bad'), 'bad', 'a bad result is returned, and counted');
  assert.equal(made, 6);

  await assert.rejects(call(async () => 'fine'), (err: Error) => err instanceof CircuitOpenError && /failed 3 times in a row \(last: bad answer\); asking again after 00:00 UTC/.test(err.message));
  assert.equal(made, 6, 'not made while open');

  // After the cooldown one call is the trial; others wait for its outcome
  now = 1000;
  let finish!: (value: string) => void;
  const trial = call(() => new Promise<string>(resolve => { finish = resolve; }));
  await assert.rejects(call(async () => 'fine'), /a trial request is under way/);
  finish('fine');
  assert.equal(await trial, 'fine');
  assert.equal(await call(async () => 'fine'), 'fine', 'closed again');
});

test('a failed trial opens it again at once; outcomes that say nothing are not counted', async () => {
  let now = 0;
  const breaker = new CircuitBreaker('Example', 2, 1000, () => now);
  for (let i = 0; i < 2; i++) await assert.rejects(breaker.run(fail, judge));
  now = 1000;
  await assert.rejects(breaker.run(fail, judge), /down/);
  await assert.rejects(breaker.run(async () => 'fine', judge), /asking again after 00:00 UTC/);

  // A neutral error during the trial leaves the next call as the trial
  now = 2000;
  await assert.rejects(breaker.run(() => Promise.reject<string>(new Error('neutral')), judge), /neutral/);
  assert.equal(await breaker.run(async () => 'fine', judge), 'fine');
  assert.ok(breaker.idle);
});

test('a status probe asks even while open, and its answer closes the circuit', async () => {
  const breaker = new CircuitBreaker('Example', 1, 60_000);
  await assert.rejects(breaker.run(fail, judge));
  await assert.rejects(breaker.run(async () => 'fine', judge), CircuitOpenError);
  assert.equal(await breaker.run(async () => 'fine', judge, { probe: true }), 'fine');
  assert.equal(await breaker.run(async () => 'fine', judge), 'fine');
});

test('a site that keeps failing is not asked again; other sites are', async () => {
  const site = host();
  let calls = network([refused()]);
  for (let i = 0; i < 3; i++) await assert.rejects(politeFetch(`${site}/doc${i}`), /fetch failed/);
  assert.equal(calls.length, 3);
  await assert.rejects(fetchOrThrow(`${site}/doc3`), /Not asked: site\d+\.example\.gov failed 3 times in a row \(last: ECONNREFUSED\)/);
  assert.equal(calls.length, 3, 'no request made');

  calls = network([ok()]);
  assert.equal((await politeFetch(`${host()}/feed`)).status, 200);
  // The status check still asks the site, and closes the circuit when it answers
  assert.equal((await politeFetch(`${site}/feed`, undefined, { probe: true })).status, 200);
  assert.equal((await politeFetch(`${site}/doc4`)).status, 200);
  assert.equal(calls.length, 3);
});

test('timeouts and 5xx count against a site; 404s and 429s do not', async () => {
  const slow = host();
  network([timedOut()]);
  for (let i = 0; i < 3; i++) await assert.rejects(politeFetch(`${slow}/${i}`), { name: 'TimeoutError' });
  await assert.rejects(politeFetch(`${slow}/3`), /last: timed out after 8s/);

  // A 503 is tried 3 times (server/retry.ts) and counts once
  const failing = host();
  let calls = network([status(503)]);
  for (let i = 0; i < 3; i++) assert.equal((await politeFetch(`${failing}/${i}`)).status, 503);
  assert.equal(calls.length, 9);
  await assert.rejects(politeFetch(`${failing}/3`), /last: HTTP 503/);

  const missing = host();
  calls = network([status(404)]);
  for (let i = 0; i < 5; i++) assert.equal((await politeFetch(`${missing}/${i}`)).status, 404);
  assert.equal(calls.length, 5);

  // A 429 has its own pause (server/http.ts), reported as such, not as a breaker
  const limited = host();
  calls = network([new Response('', { status: 429, headers: { 'Retry-After': '60' } })]);
  assert.equal((await politeFetch(`${limited}/0`)).status, 429);
  for (let i = 1; i < 5; i++) await assert.rejects(politeFetch(`${limited}/${i}`), /HTTP 429: rate limited by the site/);
  assert.equal(calls.length, 1);
});

test('a database that refuses connections is not asked again for the cooldown', async () => {
  // A TCP server that closes each connection at once, counting them
  let connections = 0;
  const closing = net.createServer(socket => { connections++; socket.destroy(); }).listen(0, '127.0.0.1');
  await new Promise(resolve => closing.once('listening', resolve));
  const { port } = closing.address() as net.AddressInfo;
  const root = path.resolve('.');
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', `
      const { getDb } = await import(${JSON.stringify(pathToFileURL(path.join(root, 'server', 'db.ts')).href)});
      const results = [];
      for (let i = 0; i < 5; i++) results.push(await getDb());
      console.log('results', JSON.stringify(results));
    `], { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: `postgres://user:pw@127.0.0.1:${port}/history`, DB_CONNECT_TIMEOUT_MS: '2000' }, timeout: 20_000 });
    assert.match(stdout, /results \[null,null,null,null,null\]/);
    assert.equal(connections, 3, 'three tries, then the history is off without connecting');
  } finally {
    closing.close();
  }
});

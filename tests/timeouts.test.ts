// Every outbound call has a time limit: the database pool (server/db.ts), the
// page's API calls (src/api/client.ts) and the service worker's network waits
// (public/sw.js). Regulator sites (8 s), Resend (15 s) and the scheduled
// check's own feed request (30 s) are limited where they are made.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import vm from 'node:vm';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createConfig } from '../config.ts';
import { WAIT_MS, fetchFeed, within } from '../src/api/client.ts';

// AbortSignal.timeout's timer does not keep Node running on its own (on Node
// 22 the test would end before it fires), so the waits below hold the
// process open until they settle
const awake = <T>(promise: Promise<T>): Promise<T> => {
  const keep = setInterval(() => {}, 1000);
  return promise.finally(() => clearInterval(keep));
};

test('database waits are limited by default and configurable', () => {
  const defaults = createConfig({}).database;
  assert.deepEqual([defaults.connectTimeoutMs, defaults.queryTimeoutMs], [10_000, 30_000]);
  const set = createConfig({ DB_CONNECT_TIMEOUT_MS: '2500', DB_QUERY_TIMEOUT_MS: '5000' }).database;
  assert.deepEqual([set.connectTimeoutMs, set.queryTimeoutMs], [2500, 5000]);
  for (const [key, value] of [['DB_CONNECT_TIMEOUT_MS', '0'], ['DB_QUERY_TIMEOUT_MS', 'soon']]) {
    assert.throws(() => createConfig({ [key]: value }), new RegExp(key));
  }
});

test('a database that accepts the connection but never answers is given up on', async () => {
  // A TCP server that says nothing, as a stuck database would
  const silent = net.createServer(() => {}).listen(0, '127.0.0.1');
  await new Promise(resolve => silent.once('listening', resolve));
  const { port } = silent.address() as net.AddressInfo;
  const root = path.resolve('.');
  const started = Date.now();
  try {
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', `
      const { getDb } = await import(${JSON.stringify(pathToFileURL(path.join(root, 'server', 'db.ts')).href)});
      console.log('db', await getDb());
    `], { env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: `postgres://user:pw@127.0.0.1:${port}/history`, DB_CONNECT_TIMEOUT_MS: '500' }, timeout: 20_000 });
    // getDb logs the failure and carries on without the history
    assert.match(stdout, /db null/);
    assert.ok(Date.now() - started < 15_000, 'gave up long before the 20 s test limit');
  } finally {
    silent.close();
  }
});

test('the page waits a limited time for each reply, and stops sooner when the caller does', async () => {
  assert.deepEqual(WAIT_MS, { feed: 60_000, status: 30_000, read: 20_000 });
  const timedOut = within(30)!;
  await awake(new Promise(resolve => timedOut.addEventListener('abort', resolve)));
  assert.equal((timedOut.reason as Error).name, 'TimeoutError');

  const caller = new AbortController();
  const both = within(60_000, caller.signal)!;
  caller.abort(new Error('the visitor typed again'));
  assert.equal(both.aborted, true);
  assert.equal((both.reason as Error).message, 'the visitor typed again');
});

test('a feed request that never answers is abandoned with a TimeoutError', async () => {
  const realFetch = globalThis.fetch;
  let signal: AbortSignal | undefined;
  // A server that never answers, but stops when the request is aborted
  globalThis.fetch = ((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
    signal = init.signal!;
    signal.addEventListener('abort', () => reject(signal!.reason));
  })) as typeof fetch;
  const realTimeout = AbortSignal.timeout;
  AbortSignal.timeout = (ms: number) => realTimeout.call(AbortSignal, Math.min(ms, 30));
  try {
    await assert.rejects(awake(fetchFeed(false)), (err: Error) => err.name === 'TimeoutError');
    assert.ok(signal?.aborted);
  } finally {
    globalThis.fetch = realFetch;
    AbortSignal.timeout = realTimeout;
  }
});

// The service worker, run with stand-ins for the browser's cache and network
// and its waits shortened to 50 ms
function serviceWorker(network: (request: any) => Promise<Response>, saved: Map<string, Response>) {
  const source = readFileSync('public/sw.js', 'utf8');
  const waits = 'const WAIT_MS = { page: 10000, feed: 50000 };';
  assert.ok(source.includes(waits), 'the waits are where the test expects them');
  const listeners: Record<string, (event: any) => void> = {};
  const cache = {
    match: async (key: any) => saved.get(String(key))?.clone(),
    put: async (key: any, response: Response) => { saved.set(String(key), response); },
    addAll: async () => {}
  };
  const context = vm.createContext({
    self: { addEventListener: (type: string, fn: (event: any) => void) => { listeners[type] = fn; }, location: { origin: 'https://site.test' } },
    caches: { open: async () => cache, match: async (key: any) => saved.get(String(key)), keys: async () => [] },
    fetch: network, Response, Headers, URL, setTimeout, clearTimeout, Promise, Date, AbortSignal
  });
  vm.runInContext(source.replace(waits, 'const WAIT_MS = { page: 50, feed: 50 };'), context);
  return (url: string, init: { method?: string; mode?: string } = {}) => new Promise<Response>((resolve, reject) => {
    listeners.fetch({ request: { url, method: init.method ?? 'GET', mode: init.mode ?? 'cors' }, respondWith: (p: Promise<Response>) => p.then(resolve, reject) });
  });
}

const neverAnswers = () => new Promise<Response>(() => {});

test('the service worker answers with the saved copy when the network stalls', async () => {
  const saved = new Map([['/', new Response('saved page')], ['/api/feeds/sync', new Response('saved notices')]]);
  const request = serviceWorker(neverAnswers, saved);
  assert.equal(await (await request('https://site.test/', { mode: 'navigate' })).text(), 'saved page');
  assert.equal(await (await request('https://site.test/api/feeds/sync')).text(), 'saved notices');
  assert.equal(await (await request('https://site.test/api/feeds/sync', { method: 'POST' })).text(), 'saved notices');
});

test('the service worker keeps waiting when there is no saved copy, and a late answer is saved', async () => {
  const saved = new Map<string, Response>();
  let answer!: (response: Response) => void;
  const request = serviceWorker(() => new Promise(resolve => { answer = resolve; }), saved);
  const pending = request('https://site.test/icon-192.png');
  await new Promise(resolve => setTimeout(resolve, 120));
  answer(new Response('icon', { status: 200 }));
  assert.equal(await (await pending).text(), 'icon');
  assert.equal(await saved.get('/icon-192.png')!.text(), 'icon');
});

test('the service worker uses the network when it answers in time, and the saved copy when offline', async () => {
  const saved = new Map([['/', new Response('saved page')]]);
  assert.equal(await (await serviceWorker(async () => new Response('live page'), saved)('https://site.test/', { mode: 'navigate' })).text(), 'live page');
  const offline = serviceWorker(async () => { throw new TypeError('Failed to fetch'); }, new Map([['/', new Response('saved page')]]));
  assert.equal(await (await offline('https://site.test/', { mode: 'navigate' })).text(), 'saved page');
  await assert.rejects(serviceWorker(async () => { throw new TypeError('Failed to fetch'); }, new Map())('https://site.test/manifest.webmanifest'), TypeError);
});

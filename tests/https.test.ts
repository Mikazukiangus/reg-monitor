// HTTPS everywhere: the headers the site is served with, what the server
// reads from regulator sites, the links it shows and emails, the cookies it
// sets (none), and no plain-HTTP address in what the browser loads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'fs';
import path from 'path';
import type { AddressInfo } from 'net';

const { politeFetch, InsecureUrlError } = await import('../server/http.ts');
const { tagNotice, httpsUrl } = await import('../server/notice.ts');
const { createConfig } = await import('../config.ts');
const { createApp } = await import('../server/app.ts');

test('every page and API reply is served with HSTS and upgrade-insecure-requests', () => {
  const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const all = vercel.headers.find((h: any) => h.source === '/(.*)');
  const header = (key: string) => all.headers.find((h: any) => h.key === key)?.value as string;
  assert.match(header('Strict-Transport-Security'), /^max-age=(\d+); includeSubDomains; preload$/);
  assert.ok(Number(header('Strict-Transport-Security').match(/max-age=(\d+)/)![1]) >= 31_536_000, 'at least a year');
  assert.match(header('Content-Security-Policy'), /(^|; )upgrade-insecure-requests($|;)/);
});

test('regulator sites are read over HTTPS only, and a redirect to plain HTTP is refused', async () => {
  const asked: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: any) => {
    asked.push(String(input));
    const res = new Response('<rss/>', { status: 200 });
    // As fetch reports a reply it was redirected to
    if (String(input).includes('moved')) Object.defineProperty(res, 'url', { value: 'http://www.example.gov/feed.xml' });
    return res;
  }) as typeof fetch;
  try {
    await assert.rejects(politeFetch('http://www.example.gov/feed.xml'), InsecureUrlError);
    assert.deepEqual(asked, [], 'a plain-HTTP address is not asked at all');
    await assert.rejects(politeFetch('https://www.example.gov/moved'), /redirect to plain HTTP/);
    assert.equal((await politeFetch('https://www.example.gov/feed.xml')).status, 200);
  } finally {
    globalThis.fetch = real;
  }
});

test('a notice\'s links are shown over HTTPS', () => {
  assert.equal(httpsUrl('http://www.example.gov/a?b=1'), 'https://www.example.gov/a?b=1');
  assert.equal(httpsUrl('https://www.example.gov/a'), 'https://www.example.gov/a');
  const notice = tagNotice({
    id: 'x-1', ref: 'X', title: 'Consultation on margin rules', regulator: 'MAS', jurisdiction: 'SINGAPORE', jurisdictionCode: 'SG',
    type: 'CONSULTATION', typeColorClass: '', impactScore: 5, issuedTimeAgo: 'Recently', tags: [], sector: '', format: 'Consultations',
    severity: 'info', dossierUrl: 'http://www.example.gov/cp', isLiveFeed: true,
    keyPoints: { points: [], facts: [], refs: [], method: 'extractive', sourceUrl: 'HTTP://www.example.gov/cp.pdf' }
  } as any);
  assert.equal(notice.dossierUrl, 'https://www.example.gov/cp');
  assert.equal(notice.keyPoints?.sourceUrl, 'https://www.example.gov/cp.pdf');
});

test('the site address in emails is HTTPS, except on this machine', () => {
  const siteUrl = (env: Record<string, string>) => createConfig(env).digest.siteUrl;
  assert.equal(siteUrl({ DIGEST_SITE_URL: 'http://regsonar.example.com/app' }), 'https://regsonar.example.com/app');
  assert.equal(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'regsonar.example.com' }), 'https://regsonar.example.com');
  assert.equal(siteUrl({ DIGEST_SITE_URL: 'http://localhost:4000' }), 'http://localhost:4000');
  assert.equal(siteUrl({ DIGEST_SITE_URL: 'http://127.0.0.1:4000' }), 'http://127.0.0.1:4000');
  assert.equal(siteUrl({ PORT: '4000' }), 'http://localhost:4000');
});

test('the API sets no cookies', async () => {
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    for (const route of ['/api/health', '/api/digest/rules', '/api/no-such-route']) {
      const res = await fetch(`http://127.0.0.1:${port}${route}`);
      await res.arrayBuffer();
      assert.equal(res.headers.get('set-cookie'), null, route);
    }
  } finally {
    server.close();
  }
});

// Mixed content: an http:// address the page loads would be blocked or
// upgraded by the browser. XML namespace names (www.w3.org) are identifiers,
// never loaded.
test('the page, its scripts, styles and public files name no plain-HTTP address', () => {
  const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
    const file = path.join(dir, name);
    return statSync(file).isDirectory() ? files(file) : [file];
  });
  const loaded = ['index.html', ...files('src'), ...files('public')].filter(f => /\.(html|tsx?|css|js|json|webmanifest)$/.test(f));
  assert.ok(loaded.length > 20);
  for (const file of loaded) {
    const plain = (readFileSync(file, 'utf8').match(/http:\/\/[^\s'"`)<>]+/g) ?? []).filter(url => !url.startsWith('http://www.w3.org/'));
    assert.deepEqual(plain, [], file);
  }
});

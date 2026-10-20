import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parse } from 'dotenv';
import { createConfig, cdnCacheControl } from '../config.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
const example = parse(await readFile(path.join(root, '.env.example')));
const runtimeUrl = pathToFileURL(path.join(root, 'runtime-config.ts')).href;
const serverUrl = pathToFileURL(path.join(root, 'server.ts')).href;
const dbUrl = pathToFileURL(path.join(root, 'server', 'db.ts')).href;
const mailerUrl = pathToFileURL(path.join(root, 'server', 'mailer.ts')).href;
const tsxUrl = import.meta.resolve('tsx');
const isolatedEnv = (overrides: Record<string, string> = {}): Record<string, string | undefined> => ({ ...process.env, ...example, NODE_ENV: 'test', ...overrides });
const child = (source: string, env: Record<string, string | undefined>, cwd = root) =>
  run(process.execPath, ['--import', tsxUrl, '--input-type=module', '-e', source], { env, cwd, timeout: 30_000, maxBuffer: 1024 * 1024 });

test('empty configuration preserves operational defaults and disables optional services', () => {
  const config = createConfig({});
  assert.equal(config.runtime.port, 3000);
  assert.equal(config.runtime.host, '0.0.0.0');
  assert.equal(config.database.url, undefined);
  assert.equal(config.digest.configured, false);
  assert.deepEqual(config.digest.to, []);
  assert.equal(config.digest.siteUrl, 'http://localhost:3000');
  assert.equal(config.ingestion.fetchTimeoutMs, 8000);
  assert.equal(config.polling.limit, 20);
  assert.equal(config.polling.backfillLimit, 50);
  assert.equal(config.archive.days, 30);
  assert.equal(config.refresh.limit, 6);
  assert.equal(cdnCacheControl(config.cdn.sync), 'public, s-maxage=300, stale-while-revalidate=86400');
});

test('the complete example parses safely and covers every supported environment name', async () => {
  assert.deepEqual(createConfig(example), createConfig({}));
  const schema = await readFile(path.join(root, 'config.ts'), 'utf8');
  const names = [...new Set([...schema.matchAll(/'([A-Z][A-Z_\d]+)'/g)].map(match => match[1]))].sort();
  assert.deepEqual(Object.keys(example).sort(), names, 'new configuration keys must be documented in .env.example');
});

test('typed overrides, zero budgets, and immutable settings work', () => {
  const config = createConfig({ PORT: ' 4567 ', HOST: '::1', NODE_ENV: 'production', VERCEL: '1', DISABLE_HMR: 'true',
    DB_POOL_MAX: '7', FETCH_TIMEOUT_MS: '1234', POLL_KEY_POINT_FETCHES: '0', POLL_DATE_BACKFILL_LIMIT: '0',
    SYNC_CDN_TTL_SECONDS: '0', REFRESH_LIMIT: '2', REFRESH_WINDOW_MS: '1500' });
  assert.equal(config.runtime.port, 4567);
  assert.equal(config.runtime.isProduction, true);
  assert.equal(config.runtime.isVercel, true);
  assert.equal(config.runtime.disableHmr, true);
  assert.equal(config.database.poolMax, 7);
  assert.equal(config.ingestion.fetchTimeoutMs, 1234);
  assert.equal(config.polling.keyPointFetches, 0);
  assert.equal(config.polling.dateBackfillLimit, 0);
  assert.equal(config.refresh.windowMs, 1500);
  assert.equal(cdnCacheControl(config.cdn.sync), 'public, s-maxage=0, stale-while-revalidate=86400');
  for (const object of [config, ...Object.values(config), config.cdn.sync, config.digest.to]) assert.ok(Object.isFrozen(object));
  assert.throws(() => { (config.runtime as any).port = 1; }, TypeError);
});

test('database aliases and site URLs follow documented precedence', () => {
  assert.equal(createConfig({ POSTGRES_URL: 'postgres://user:password@localhost/history' }).database.url, 'postgres://user:password@localhost/history');
  assert.equal(createConfig({ DATABASE_URL: 'pglite', POSTGRES_URL: 'unused' }).database.url, 'pglite');
  assert.equal(createConfig({ DATABASE_URL: ' ', POSTGRES_URL: 'pglite' }).database.url, 'pglite');
  assert.equal(createConfig({ PORT: '4000' }).digest.siteUrl, 'http://localhost:4000');
  assert.equal(createConfig({ VERCEL_PROJECT_PRODUCTION_URL: 'regsonar.example.com' }).digest.siteUrl, 'https://regsonar.example.com');
  assert.equal(createConfig({ DIGEST_SITE_URL: 'https://custom.example.com/app/', VERCEL_PROJECT_PRODUCTION_URL: 'regsonar.example.com' }).digest.siteUrl, 'https://custom.example.com/app');
});

test('email is configured only when the optional sending settings are complete', () => {
  assert.equal(createConfig({ CRON_SECRET: 'test-secret' }).digest.configured, false);
  const config = createConfig({ CRON_SECRET: 'test-secret', RESEND_API_KEY: 're_test', DIGEST_TO: ' owner@example.com, team@example.com, ', DIGEST_FROM: 'RegSonar <sender@example.com>' });
  assert.equal(config.digest.configured, true);
  assert.deepEqual(config.digest.to, ['owner@example.com', 'team@example.com']);
  assert.equal(config.digest.from, 'RegSonar <sender@example.com>');
});

test('invalid values fail validation without echoing credentials or tokens', () => {
  const secret = 'do-not-echo-this-secret';
  assert.throws(() => createConfig({ PORT: 'not-a-port', FETCH_TIMEOUT_MS: '-1', NODE_ENV: 'prod', DISABLE_HMR: 'yes',
    DATABASE_URL: `postgresql://user:${secret}@`, RESEND_API_KEY: `${secret} bad`, DIGEST_TO: 'missing-at-sign', DIGEST_FROM: 'bad sender',
    DIGEST_SITE_URL: `https://user:${secret}@example.com`, POLL_LIMIT: '100', POLL_BACKFILL_LIMIT: '50' }), error => {
    const message = (error as Error).message;
    for (const key of ['PORT', 'FETCH_TIMEOUT_MS', 'NODE_ENV', 'DISABLE_HMR', 'DATABASE_URL', 'RESEND_API_KEY', 'DIGEST_TO', 'DIGEST_FROM', 'DIGEST_SITE_URL', 'POLL_BACKFILL_LIMIT']) assert.ok(message.includes(key), key);
    assert.ok(!message.includes(secret));
    return true;
  });
  for (const [key, value] of [
    ['PORT', '0'], ['PORT', '65536'], ['PORT', '3e3'], ['PORT', '3.5'], ['PORT', '0x10'],
    ['FETCH_TIMEOUT_MS', '2147483648'], ['DB_POOL_MAX', '101'], ['VERCEL', 'maybe'],
    ['HOST', 'http://localhost:3000'], ['HOST', '999.999.999.999'], ['HOST', 'bad..host'],
    ['DIGEST_SITE_URL', 'javascript:alert(1)'], ['DIGEST_SITE_URL', 'https://example.com/?secret=x'],
    ['DIGEST_SITE_URL', 'https://example.com/?'], ['DIGEST_SITE_URL', 'https://example.com/#'],
    ['VERCEL_PROJECT_PRODUCTION_URL', 'https://example.com'], ['VERCEL_PROJECT_PRODUCTION_URL', 'example.com/path'],
    ['DATABASE_URL', 'https://example.com'], ['POSTGRES_URL', 'invalid'], ['CRON_SECRET', 'contains space']
  ]) assert.throws(() => createConfig({ [key]: value }), new RegExp(key), `${key}=${value}`);
});

test('dotenv loads before direct database imports, process overrides win, and configuration stays a snapshot', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'regsonar-config-'));
  try {
    await writeFile(path.join(directory, '.env'), 'PORT=4100\nDATABASE_URL=pglite\nDISABLE_HMR=true\n');
    const env = isolatedEnv({ PORT: '4200' });
    delete env.DATABASE_URL;
    delete env.DISABLE_HMR;
    const { stdout } = await child(`
      import assert from 'node:assert/strict';
      const { databaseUrl } = await import(${JSON.stringify(dbUrl)});
      const { config } = await import(${JSON.stringify(runtimeUrl)});
      assert.equal(databaseUrl(), 'pglite');
      assert.equal(config.runtime.port, 4200);
      assert.equal(config.runtime.disableHmr, true);
      process.env.PORT = '4300';
      assert.equal(config.runtime.port, 4200);
      console.log('configuration precedence verified');
    `, env, directory);
    assert.match(stdout, /configuration precedence verified/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('the API uses configured cache headers, keeps optional jobs off, and exposes no secrets', async () => {
  const { stdout } = await child(`
    import assert from 'node:assert/strict';
    import { once } from 'node:events';
    const { config } = await import(${JSON.stringify(runtimeUrl)});
    const { createApp } = await import(${JSON.stringify(serverUrl)});
    const { getDb, saveNotices } = await import(${JSON.stringify(dbUrl)});
    await saveNotices(await getDb(), [{ id: 'config-test', ref: 'FCA test', regulator: 'UK FCA', jurisdiction: 'UNITED KINGDOM', jurisdictionCode: 'UK_EU', format: 'Announcements', type: 'ANNOUNCEMENT', title: 'Configuration regression notice', tags: [] }]);
    const server = createApp().listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      assert.equal((await fetch(base + '/api/health')).status, 200);
      for (const route of ['/api/feeds/poll', '/api/digest']) {
        const response = await fetch(base + route);
        assert.equal(response.status, 503);
        assert.equal(response.headers.get('cache-control'), 'no-store');
      }
      const response = await fetch(base + '/api/notices/search?q=Configuration');
      assert.equal(response.status, 200, await response.clone().text());
      assert.equal(response.headers.get('cache-control'), 'public, s-maxage=17, stale-while-revalidate=31');
      assert.equal((await response.json()).notices.length, 1);
      const rulesResponse = await fetch(base + '/api/digest/rules');
      const body = await rulesResponse.text();
      assert.equal(JSON.parse(body).configured, false);
      assert.ok(!body.includes(config.digest.apiKey));
      assert.ok(!body.includes(config.digest.to[0]));
      assert.equal(rulesResponse.headers.get('cache-control'), 'no-store');
    } finally { await new Promise(resolve => server.close(resolve)); }
    console.log('API configuration verified');
  `, isolatedEnv({ DATABASE_URL: 'pglite', CRON_SECRET: '', RESEND_API_KEY: 're_config_secret_canary', DIGEST_TO: 'private-config-canary@example.com', SEARCH_CDN_TTL_SECONDS: '17', SEARCH_CDN_STALE_SECONDS: '31' }));
  assert.match(stdout, /API configuration verified/);
});

test('the email sender uses the configured timeout', async () => {
  const { stdout } = await child(`
    import assert from 'node:assert/strict';
    const { sendWithResend } = await import(${JSON.stringify(mailerUrl)});
    globalThis.fetch = async (url, options) => {
      assert.equal(url, 'https://api.resend.com/emails');
      await new Promise(resolve => setTimeout(resolve, 40));
      assert.equal(options.signal.aborted, true);
      return new Response(JSON.stringify({ id: 'mock-email' }), { status: 200 });
    };
    assert.equal((await sendWithResend({ apiKey: 'test', from: 'sender@example.com', to: ['owner@example.com'], subject: 'test', text: 'test', html: 'test' })).id, 'mock-email');
    console.log('email timeout verified');
  `, isolatedEnv({ RESEND_TIMEOUT_MS: '5' }));
  assert.match(stdout, /email timeout verified/);
});

test('invalid startup configuration stops the server before it listens', async () => {
  await assert.rejects(child(`await import(${JSON.stringify(serverUrl)}); console.log('unexpected startup');`, isolatedEnv({ PORT: 'invalid-port' })), error => {
    assert.match((error as any).stderr, /PORT: must be a whole number/);
    assert.ok(!(error as any).stdout.includes('unexpected startup'));
    return true;
  });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { parse } from 'dotenv';
import { createLogger, createRedactor, REDACTED } from '../shared/logging.ts';

test('configured secrets and their encoded forms are removed without changing the input', () => {
  const secret = ['opaque', 'credential', 'canary'].join('/');
  const redactor = createRedactor([secret]);
  const input = { message: `Failure: ${secret}`, encoded: encodeURIComponent(secret), nested: [secret] };
  const output = redactor.value(input);
  assert.ok(!JSON.stringify(output).includes(secret));
  assert.ok(!JSON.stringify(output).includes(encodeURIComponent(secret)));
  assert.equal(input.message, `Failure: ${secret}`);
  assert.equal(redactor.errorMessage(new Error(secret)), REDACTED);
});

test('sensitive structured fields are removed at any depth', () => {
  const redactor = createRedactor();
  const input = { request: { headers: { Authorization: 'opaque-auth', Cookie: 'opaque-cookie' }, password: 'opaque-password',
    accessToken: 'opaque-access', CRON_SECRET: 'opaque-cron', DATABASE_URL: 'opaque-database', api_key: 'opaque-api',
    nested: { connectionString: 'opaque-connection', privateKey: 'opaque-private', signature: 'opaque-signature', apiKeys: ['opaque-plural'] } }, safe: { status: 503, count: 4 } };
  const output = redactor.value(input) as any;
  assert.ok(!JSON.stringify(output).includes('opaque-'));
  assert.deepEqual({ ...output.safe }, { status: 503, count: 4 });
  assert.equal(output.request.nested.signature, REDACTED);
});

test('credential URLs, encoded query names, signed URLs and authentication headers are masked', () => {
  const redactor = createRedactor();
  const input = 'postgresql://user:opaque-password@host/db?sslmode=require https://site.test/path?api%5Fkey=opaque-key&X-Amz-Signature=opaque-signature&rows=20 Authorization: Bearer opaque-bearer Proxy-Authorization: Basic opaque-basic';
  const output = redactor.text(input);
  for (const secret of ['opaque-password', 'opaque-key', 'opaque-signature', 'opaque-bearer', 'opaque-basic']) assert.ok(!output.includes(secret));
  assert.ok(output.includes('host/db?sslmode=require'));
  assert.ok(output.includes('rows=20'));
  assert.ok(!redactor.text('https://user:opaque@password@host/path').includes('opaque'));
});

test('quoted and unquoted credential assignments are masked', () => {
  const redactor = createRedactor();
  for (const input of ['apiKey=opaque-canary', 'CRON_SECRET: opaque-canary', '{"password":"opaque-canary"}', "access_token='opaque-canary'"]) {
    assert.ok(!redactor.text(input).includes('opaque-canary'), input.split(/[=:]/)[0]);
  }
});

test('recognizable provider tokens, JWTs and private key blocks are masked', () => {
  const redactor = createRedactor();
  const canaries = [
    'ghp_' + 'a'.repeat(36), 'github_pat_' + 'b'.repeat(82), 're_' + 'c'.repeat(32),
    'sk-proj-' + 'd'.repeat(40), 'sk_live_' + 'e'.repeat(30), 'xoxb-' + 'f'.repeat(24),
    'AKIA' + 'G'.repeat(16), 'eyJ' + 'h'.repeat(12) + '.' + 'i'.repeat(12) + '.' + 'j'.repeat(12),
    ['-----BEGIN', 'PRIVATE KEY-----\nopaque-key-material\n-----END', 'PRIVATE KEY-----'].join(' ')
  ];
  for (const canary of canaries) assert.ok(!redactor.text(canary).includes(canary));
  assert.ok(!redactor.text(canaries.at(-1)!).includes('opaque-key-material'));
});

test('errors omit stacks, request bodies and custom fields, while nested causes are sanitized', () => {
  const redactor = createRedactor(['opaque-canary']);
  const error = Object.assign(new Error('Failed with opaque-canary', { cause: new Error('password=opaque-other') }), { code: 'ECONNRESET', body: 'never-log-body', config: { private: 'never-log-config' } });
  const result = redactor.value(error) as any;
  const output = JSON.stringify(result);
  for (const secret of ['opaque-canary', 'opaque-other', 'never-log-body', 'never-log-config']) assert.ok(!output.includes(secret));
  assert.ok(!('stack' in result));
  assert.equal(result.code, 'ECONNRESET');
  assert.equal(result.cause.name, 'Error');
});

test('getters, binary data, cycles and large nesting cannot dump arbitrary data', () => {
  const redactor = createRedactor();
  let reads = 0;
  const object: any = { bytes: new Uint8Array([1, 2, 3]) };
  Object.defineProperty(object, 'getter', { get() { reads++; return 'never-read'; }, enumerable: true });
  object.self = object;
  const result = redactor.value(object) as any;
  assert.equal(reads, 0);
  assert.equal(result.bytes, '[Binary data]');
  assert.equal(result.self, '[Circular]');
  assert.equal(result.getter, '[Getter omitted]');
  const deep: any = {};
  let current = deep;
  for (let i = 0; i < 20; i++) current = current.next = {};
  assert.ok(JSON.stringify(redactor.value(deep)).includes('[Maximum log depth]'));
});

test('control characters cannot forge log entries and redaction happens before truncation', () => {
  const secret = 'opaque-canary';
  const redactor = createRedactor([secret]);
  assert.equal(redactor.text('line\nforged\r\u001b[31m'), 'line\\u000aforged\\u000d\\u001b[31m');
  const output = redactor.text('x'.repeat(7995) + secret);
  assert.ok(!output.includes('opaque'));
  assert.ok(output.length <= 8000);
});

test('every log level sanitizes messages and structured arguments', () => {
  const entries: unknown[][] = [];
  const sink = { log: (...values: unknown[]) => entries.push(values), warn: (...values: unknown[]) => entries.push(values), error: (...values: unknown[]) => entries.push(values) };
  const logger = createLogger({ secrets: ['opaque-canary'], sink });
  for (const method of [logger.info, logger.warn, logger.error]) method('operation failed opaque-canary', { apiKey: 'opaque-key' }, new Error('password=opaque-password'));
  assert.equal(entries.length, 3);
  assert.ok(!JSON.stringify(entries).includes('opaque-'));
  assert.equal(logger.errorMessage(undefined, 'Request failed'), 'Request failed');
});

test('failed sanitizers and log sinks never fall back to raw values or crash a request', () => {
  const entries: unknown[][] = [];
  const sink = { log: (...values: unknown[]) => entries.push(values), warn: () => { throw new Error('sink unavailable'); }, error: (...values: unknown[]) => entries.push(values) };
  const logger = createLogger({ sink });
  const hostile = new Proxy({}, { ownKeys() { throw new Error('opaque-private-value'); }, getOwnPropertyDescriptor() { throw new Error('opaque-private-value'); } });
  assert.doesNotThrow(() => logger.error('event', hostile));
  assert.doesNotThrow(() => logger.warn('event'));
  assert.ok(!JSON.stringify(entries).includes('opaque-private-value'));
  assert.match(JSON.stringify(entries), /sanitization failed/);
  assert.equal(logger.errorMessage(hostile, 'Safe fallback'), 'Safe fallback');
});

test('the API and captured logs do not expose configured secrets or malformed request bodies', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const example = parse(await readFile(path.join(root, '.env.example')));
  const env = { ...process.env, ...example, NODE_ENV: 'development', DATABASE_URL: 'pglite', CRON_SECRET: 'cron-canary-value', RESEND_API_KEY: 'resend-canary-value', DIGEST_TO: 'private-canary@example.com' };
  const serverUrl = pathToFileURL(path.join(root, 'server.ts')).href;
  const runtimeUrl = pathToFileURL(path.join(root, 'runtime-config.ts')).href;
  const dbUrl = pathToFileURL(path.join(root, 'server', 'db.ts')).href;
  const { stdout } = await promisify(execFile)(process.execPath, ['--import', import.meta.resolve('tsx'), '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { once } from 'node:events';
    const { config } = await import(${JSON.stringify(runtimeUrl)});
    const { createApp } = await import(${JSON.stringify(serverUrl)});
    const { getDb, saveScheduledCheck } = await import(${JSON.stringify(dbUrl)});
    const entries = [];
    const original = { log: console.log, warn: console.warn, error: console.error };
    for (const level of Object.keys(original)) console[level] = (...values) => entries.push(values);
    const db = await getDb();
    await saveScheduledCheck(db, { id: 'old-error', startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), status: 'failed', summary: { sources: [], pageDatesFound: 0, failed: [{ name: 'test', error: config.digest.apiKey }] } });
    const server = createApp().listen(0, '127.0.0.1');
    try {
      await once(server, 'listening');
      const base = 'http://127.0.0.1:' + server.address().port;
      const checks = await fetch(base + '/api/feeds/checks');
      assert.ok(!(await checks.text()).includes(config.digest.apiKey));
      const originalQuery = db.query;
      db.query = async () => { throw new Error('DB rejected ' + config.digest.apiKey); };
      const search = await fetch(base + '/api/notices/search?q=example');
      assert.equal(search.status, 500);
      assert.deepEqual(await search.json(), { success: false, error: 'Search failed' });
      db.query = originalQuery;
      const invalid = await fetch(base + '/api/feeds/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"secret": "' + config.digest.cronSecret + '", not-valid-json}' });
      assert.equal(invalid.status, 400);
      // Refused before it is read: no route takes a body
      assert.deepEqual(await invalid.json(), { success: false, error: 'This request takes no body' });
      const serialized = JSON.stringify(entries);
      for (const secret of [config.digest.apiKey, config.digest.cronSecret, config.digest.to[0]]) assert.ok(!serialized.includes(secret));
      assert.ok(serialized.includes('[REDACTED]'));
    } finally {
      await new Promise(resolve => server.close(resolve));
      for (const level of Object.keys(original)) console[level] = original[level];
    }
    console.log('API and log isolation verified');
  `], { cwd: root, env, timeout: 30_000, maxBuffer: 1024 * 1024 });
  assert.match(stdout, /API and log isolation verified/);
});

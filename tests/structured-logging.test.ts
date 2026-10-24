// Structured logging: the server writes one redacted JSON object a line
// (shared/logging.ts), and each entry written while a request or job runs
// carries its context without being passed along (server/log-context.ts,
// server/request-context.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

process.env.DATABASE_URL = 'pglite';
process.env.RESEND_API_KEY = 're_structuredlogs_0123456789abcdefgh';
const { createLogger, createRedactor } = await import('../shared/logging.ts');
const { createConfig } = await import('../config.ts');
const { createApp } = await import('../server/app.ts');
const { openStore } = await import('../server/store.ts');
const { getDb } = await import('../server/db.ts');
const { captureError, flushErrors } = await import('../server/error-tracking.ts');
const { withLogContext, logContext } = await import('../server/log-context.ts');

// What the server logged while fn ran, each line parsed
async function captured(fn: () => Promise<void>): Promise<Record<string, any>[]> {
  const lines: [string, unknown[]][] = [];
  const original = { log: console.log, warn: console.warn, error: console.error };
  for (const method of ['log', 'warn', 'error'] as const) console[method] = (...values: unknown[]) => lines.push([method, values]);
  try {
    await fn();
  } finally {
    Object.assign(console, original);
  }
  return lines.map(([method, values]) => {
    assert.equal(values.length, 1, 'one value a line');
    return { ...JSON.parse(values[0] as string), method };
  });
}

async function serve(run: (url: (path: string) => string) => Promise<void>) {
  const server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    await run(path => `${base}${path}`);
  } finally {
    server.close();
  }
}

test('an entry is one line of JSON: time, level, scope, message, context, error and data, redacted', () => {
  const lines: [string, string][] = [];
  const sink = { log: (v: string) => lines.push(['log', v]), warn: (v: string) => lines.push(['warn', v]), error: (v: string) => lines.push(['error', v]) };
  let getterRead = false;
  const data = { count: 4, apiKey: 'opaque-key' };
  Object.defineProperty(data, 'lazy', { get() { getterRead = true; return 1; }, enumerable: true });
  const logger = createLogger({
    format: 'json', sink, secrets: ['opaque-canary'], now: () => new Date('2026-10-24T07:00:00Z'),
    base: { deployment: 'dpl_test' }, context: () => ({ request: { id: 'req-1', method: 'GET', path: '/api/x' } })
  });
  logger.warn('[RegSonar Poll] Source failed: opaque-canary', new Error('password=opaque-password'), data, 3);
  logger.info('[RegSonar] Ready');
  logger.error({ status: 500 });
  assert.deepEqual(lines.map(([m]) => m), ['warn', 'log', 'error']);
  const [warn, info, error] = lines.map(([, line]) => JSON.parse(line));
  assert.deepEqual(Object.keys(warn), ['time', 'level', 'scope', 'msg', 'deployment', 'request', 'error', 'data']);
  assert.equal(warn.time, '2026-10-24T07:00:00.000Z');
  assert.equal(warn.level, 'warn');
  assert.equal(warn.scope, 'Poll');
  assert.equal(warn.msg, 'Source failed: [REDACTED] 3');
  assert.equal(warn.request.id, 'req-1');
  assert.deepEqual(warn.error, { name: 'Error', message: 'password=[REDACTED]' });
  assert.deepEqual(warn.data, { count: 4, apiKey: '[REDACTED]', lazy: '[Getter omitted]' });
  assert.equal(getterRead, false);
  assert.equal(info.scope, 'app');
  assert.equal(info.msg, 'Ready');
  assert.deepEqual([error.msg, error.data], ['', { status: 500 }]);
  for (const [, line] of lines) assert.ok(!line.includes('opaque-') && !line.includes('\n'));
});

test('a failing sanitizer still writes a JSON line, without the values', () => {
  const lines: string[] = [];
  const sink = { log: (v: string) => lines.push(v), warn: (v: string) => lines.push(v), error: (v: string) => lines.push(v) };
  const hostile = new Proxy({}, { ownKeys() { throw new Error('opaque-private'); }, getOwnPropertyDescriptor() { throw new Error('opaque-private'); } });
  createLogger({ format: 'json', sink }).error('event', hostile);
  const entry = JSON.parse(lines[0]);
  assert.deepEqual([entry.level, entry.msg], ['error', '[RegSonar] Log event omitted: sanitization failed']);
  assert.ok(!lines[0].includes('opaque-private'));
  // The text form is unchanged
  assert.ok(createRedactor().text('x').length);
});

test('LOG_FORMAT is json unless set to text', () => {
  assert.equal(createConfig({}).logging.format, 'json');
  assert.equal(createConfig({ LOG_FORMAT: 'text' }).logging.format, 'text');
  assert.throws(() => createConfig({ LOG_FORMAT: 'xml' }), /LOG_FORMAT: must be json or text/);
});

test('entries written for a request carry its id, method, path and hashed visitor, never the query', async () => {
  const store = (await openStore())!;
  const search = store.search;
  store.search = async () => { throw new Error(`database said no to ${process.env.RESEND_API_KEY}`); };
  let replies: { id: string; reference: string }[] = [];
  try {
    const entries = await captured(() => serve(async url => {
      // Two at once: each entry has its own request's context
      replies = await Promise.all(['iad1::abc-1', 'hkg1::def-2'].map(async id => {
        const res = await fetch(url('/api/notices/search?q=private+matter'), { headers: { 'x-vercel-id': id } });
        return { id, reference: (await res.json()).reference as string };
      }));
      await flushErrors();
    }));
    for (const { id, reference } of replies) {
      const entry = entries.find(e => e.msg.includes(reference))!;
      assert.equal(entry.method, 'error');
      assert.equal(entry.scope, 'Errors');
      assert.deepEqual(entry.request, { id, method: 'GET', path: '/api/notices/search' });
      assert.match(entry.visitor, /^ip:[\w-]{22}$/);
      assert.equal(entry.deployment, 'local');
      assert.equal(entry.error.message, 'database said no to [REDACTED]');
    }
    const all = JSON.stringify(entries);
    assert.ok(!all.includes('private') && !all.includes('127.0.0.1') && !all.includes(process.env.RESEND_API_KEY!));
    // The captured error keeps the request too, but not the visitor
    const [row] = await (await getDb())!.query(`SELECT context FROM error_events WHERE reference = $1`, [replies[0].reference]);
    assert.deepEqual(row.context.request, { id: replies[0].id, method: 'GET', path: '/api/notices/search' });
    assert.ok(!('visitor' in row.context));
  } finally {
    store.search = search;
  }
});

test('the context survives a parsed body and the work done after the response', async () => {
  let reference = '';
  const entries = await captured(() => serve(async url => {
    const res = await fetch(url('/api/errors'), {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-vercel-id': 'sin1::body-1' },
      body: JSON.stringify({ where: 'render', message: 'Context check' })
    });
    reference = (await res.json()).reference;
    await flushErrors();
  }));
  const entry = entries.find(e => e.msg.includes(reference))!;
  assert.deepEqual(entry.request, { id: 'sin1::body-1', method: 'POST', path: '/api/errors' });
  const [row] = await (await getDb())!.query(`SELECT context FROM error_events WHERE reference = $1`, [reference]);
  assert.equal(row.context.request.id, 'sin1::body-1');
});

test('a job adds its own fields to the context, and outside any request there is none', async () => {
  assert.equal(logContext(), undefined);
  const entries = await captured(async () => {
    await withLogContext({ request: { id: 'req-9', method: 'GET', path: '/api/feeds/poll' } }, () =>
      withLogContext({ job: { id: 'job-1', kind: 'key-points', target: 'mas-x', attempt: 2 } }, async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        captureError(new Error('Job context check'), { where: 'Job context test' });
        await flushErrors();
      }));
  });
  const entry = entries.find(e => e.msg.startsWith('Job context test failed'))!;
  assert.equal(entry.request.id, 'req-9');
  assert.deepEqual(entry.job, { id: 'job-1', kind: 'key-points', target: 'mas-x', attempt: 2 });
  assert.equal(logContext(), undefined);
});

// CORS (server/cors.ts): the site's own page and requests without an Origin
// reach the API as before; listed origins get CORS headers without
// credentials; any other origin is refused before the route runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'net';
import { originPolicy } from '../server/cors.ts';
import { createConfig } from '../config.ts';
import { createApp } from '../server/app.ts';

const PARTNER = 'https://dashboard.example.com';

async function withServer(app: express.Express, run: (base: string, host: string) => Promise<void>) {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}`, `127.0.0.1:${port}`);
  } finally {
    server.close();
  }
}

// A route behind the policy that records whether it ran
function policyApp(allowed: string[]) {
  const ran: string[] = [];
  const app = express();
  app.use('/api', originPolicy(allowed));
  app.all('/api/thing', (req, res) => { ran.push(req.method); res.json({ ok: true }); });
  return { app, ran };
}

test('requests without an Origin and from the site\'s own page reach the route without CORS headers', async () => {
  const { app, ran } = policyApp([PARTNER]);
  await withServer(app, async (base, host) => {
    for (const origin of [undefined, `http://${host}`]) {
      for (const method of ['GET', 'POST']) {
        const res = await fetch(`${base}/api/thing`, { method, headers: origin ? { origin } : {} });
        assert.equal(res.status, 200, `${method} ${origin}`);
        assert.equal(res.headers.get('access-control-allow-origin'), null);
        assert.match(res.headers.get('vary') ?? '', /Origin/);
        await res.arrayBuffer();
      }
    }
    // Behind Vercel the requested host may arrive as x-forwarded-host
    const forwarded = await fetch(`${base}/api/thing`, { headers: { origin: 'https://reg-monitor-beta.vercel.app', 'x-forwarded-host': 'reg-monitor-beta.vercel.app' } });
    assert.equal(forwarded.status, 200);
  });
  assert.equal(ran.length, 5);
});

test('a listed origin gets its own origin back, no credentials, and a preflight for GET, HEAD and POST only', async () => {
  const { app, ran } = policyApp([PARTNER]);
  await withServer(app, async base => {
    const res = await fetch(`${base}/api/thing`, { headers: { origin: PARTNER } });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), PARTNER);
    assert.equal(res.headers.get('access-control-allow-credentials'), null);
    await res.arrayBuffer();

    const preflight = await fetch(`${base}/api/thing`, { method: 'OPTIONS', headers: { origin: PARTNER, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), PARTNER);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'GET, HEAD, POST');
    // No headers allowed, so a browser will not send Authorization (the cron secret)
    assert.equal(preflight.headers.get('access-control-allow-headers'), null);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
    assert.equal(preflight.headers.get('cache-control'), 'no-store');
  });
  assert.deepEqual(ran, ['GET']);
});

test('any other origin is refused before the route runs', async () => {
  const { app, ran } = policyApp([PARTNER]);
  await withServer(app, async (base, host) => {
    for (const origin of ['https://evil.example.com', 'null', 'https://dashboard.example.com.evil.example', `https://${host}.evil.example`, 'http://dashboard.example.com', 'not a url']) {
      for (const method of ['GET', 'POST', 'OPTIONS']) {
        const res = await fetch(`${base}/api/thing`, { method, headers: { origin } });
        assert.equal(res.status, 403, `${method} ${origin}`);
        assert.equal(res.headers.get('access-control-allow-origin'), null);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.deepEqual(await res.json(), { success: false, error: 'Origin not allowed' });
      }
    }
  });
  assert.deepEqual(ran, []);
});

test('the API refuses other sites by default and leaves cron-style requests alone', async () => {
  await withServer(createApp(), async (base, host) => {
    const foreign = await fetch(`${base}/api/health`, { headers: { origin: 'https://evil.example.com' } });
    assert.equal(foreign.status, 403);
    await foreign.arrayBuffer();
    for (const headers of [{}, { origin: `http://${host}` }]) {
      const res = await fetch(`${base}/api/health`, { headers });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('access-control-allow-origin'), null);
      await res.arrayBuffer();
    }
    // The cron routes still answer a request without an Origin (401 without the secret)
    const poll = await fetch(`${base}/api/feeds/poll`);
    assert.ok([401, 503].includes(poll.status));
    await poll.arrayBuffer();
  });
});

test('CORS_ALLOWED_ORIGINS takes exact origins only', () => {
  assert.deepEqual(createConfig({}).cors.allowedOrigins, []);
  assert.deepEqual(createConfig({ CORS_ALLOWED_ORIGINS: ' https://Dashboard.example.com/ , https://b.example.com:8443,http://localhost:5173,https://dashboard.example.com' }).cors.allowedOrigins,
    ['https://dashboard.example.com', 'https://b.example.com:8443', 'http://localhost:5173']);
  for (const value of ['*', 'null', 'https://*.example.com', 'http://example.com', 'https://example.com/path', 'https://user:pw@example.com', 'example.com', 'https://example.com?x=1', 'javascript:alert(1)']) {
    assert.throws(() => createConfig({ CORS_ALLOWED_ORIGINS: value }), /CORS_ALLOWED_ORIGINS/, value);
  }
});

// The US relay for the FTC's feed (server/relay.ts, api/ftc-feed.ts), and how
// a failed reply is described, through the relay or not
import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL_REGION = 'iad1';
const { relayFeed } = await import('../server/relay.ts');
const { httpStatusText, RELAYED_FROM_HEADER } = await import('../server/http.ts');

const FEED = 'https://www.ftc.gov/feeds/press-release.xml';
const RSS = '<?xml version="1.0"?><rss version="2.0"><channel><title>FTC</title></channel></rss>';

function answering(reply: () => Response) {
  const asked: string[] = [];
  globalThis.fetch = (async (input: any) => { asked.push(String(input)); return reply(); }) as typeof fetch;
  return asked;
}

test('the relay passes on a feed that loads, kept for 10 minutes', async () => {
  const asked = answering(() => new Response(RSS, { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } }));
  const reply = await relayFeed(FEED);
  assert.deepEqual(asked, [FEED]);
  assert.equal(reply.status, 200);
  assert.equal(new TextDecoder().decode(reply.body as Uint8Array), RSS);
  assert.equal(reply.headers['Content-Type'], 'application/rss+xml; charset=utf-8');
  assert.match(reply.headers['Cache-Control'], /s-maxage=600/);
  assert.equal(reply.headers[RELAYED_FROM_HEADER], 'www.ftc.gov');
  assert.equal(reply.headers['x-regsonar-relay-region'], 'iad1');
});

test('the relay passes on the status of a site that refuses, without its page, for a minute', async () => {
  answering(() => new Response('<title>Page Not Found</title>', { status: 404 }));
  const reply = await relayFeed(FEED);
  assert.equal(reply.status, 404);
  assert.equal(reply.body, '');
  assert.match(reply.headers['Cache-Control'], /s-maxage=60$/);
  assert.equal(reply.headers[RELAYED_FROM_HEADER], 'www.ftc.gov');
});

test('the relay answers 502 when the site cannot be reached', async () => {
  globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  assert.equal((await relayFeed(FEED)).status, 502);
});

test('a failed reply says why when the reason is known', () => {
  const refused = new Response('', { status: 404 });
  assert.equal(httpStatusText(FEED, refused), 'HTTP 404: ftc.gov refuses requests from outside the US');
  assert.equal(httpStatusText('https://www.sec.gov/rss', refused), 'HTTP 404');
  const relayed = new Response('', { status: 404, headers: { [RELAYED_FROM_HEADER]: 'www.ftc.gov' } });
  assert.equal(httpStatusText('https://regsonar.example.com/api/ftc-feed', relayed), 'HTTP 404 from www.ftc.gov through the US relay');
});

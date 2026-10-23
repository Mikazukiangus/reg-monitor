// The SSRF guard (server/ssrf.ts): addresses the server did not choose are
// read only from the public internet, checked as each connection is made,
// redirects included. These tests make real connections (fetch is not
// replaced here), so they also check the guard works with this Node's fetch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'net';
import { BlockedAddressError, guardedAgent, isPublicAddress, publicAddressFor } from '../server/ssrf.ts';
import { politeFetch } from '../server/http.ts';

test('only public internet addresses are allowed', () => {
  for (const address of [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '127.255.255.254', '169.254.169.254', '172.16.0.1', '172.31.255.255',
    '192.0.0.1', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', '::ffff:127.0.0.1', '::ffff:a00:1', '::ffff:169.254.169.254', '64:ff9b::a00:1', '2001:db8::1', '2002:a00:1::1',
    'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', 'not an address', ''
  ]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '203.0.114.1', '::ffff:8.8.8.8', '2606:4700:4700::1111', '2404:6800::1'])
    assert.equal(isPublicAddress(address), true, address);
});

test('a host name is refused when it resolves to a private address', async () => {
  await assert.rejects(publicAddressFor('localhost'), BlockedAddressError);
  await assert.rejects(publicAddressFor('[::1]'), BlockedAddressError);
  assert.equal(await publicAddressFor('8.8.8.8'), '8.8.8.8');
});

test('politeFetch refuses private addresses however they are written', async () => {
  for (const url of ['https://127.0.0.1:8443/', 'https://localhost:8443/', 'https://169.254.169.254/latest/meta-data/', 'https://[::1]:8443/',
    'https://[::ffff:10.0.0.1]/', 'https://0x7f000001:8443/', 'https://2130706433:8443/', 'https://10.1/']) {
    await assert.rejects(politeFetch(url), (err: any) => err instanceof BlockedAddressError && /is not a public internet address/.test(err.message), url);
  }
});

test('a redirect to a private address is refused at the redirect, before it connects', async () => {
  // 127.0.0.1 stands in for a public site; ::1 for the private network
  const reached: string[] = [];
  const site = http.createServer((req, res) => {
    reached.push(req.url!);
    res.writeHead(302, { Location: 'http://[::1]:8443/admin' }).end();
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => site.once('listening', resolve));
  const agent = guardedAgent(address => address === '127.0.0.1');
  try {
    const { port } = site.address() as AddressInfo;
    await assert.rejects(fetch(`http://127.0.0.1:${port}/notice`, { dispatcher: agent } as RequestInit),
      (err: any) => err.cause instanceof BlockedAddressError && /::1 is not a public internet address/.test(err.cause.message));
    assert.deepEqual(reached, ['/notice']);
    // The allowed site itself is read normally
    const res = await fetch(`http://127.0.0.1:${port}/other`, { dispatcher: agent, redirect: 'manual' } as RequestInit);
    assert.equal(res.status, 302);
  } finally {
    site.close();
    await agent.close();
  }
});

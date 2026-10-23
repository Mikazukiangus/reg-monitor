// The server reads addresses it did not choose: links in regulators' feeds,
// PDF links found on their pages, and wherever those redirect. None of them
// may reach this server's own network (the cloud metadata service at
// 169.254.169.254, the database, anything on localhost or a private range).
// The check runs when each connection is made, on the address the host name
// resolved to, and that same address is the one connected to. So every
// redirect hop is checked, and a name that resolves to a public address once
// and to a private one later (DNS rebinding) is still refused.
import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { Agent, buildConnector } from 'undici';

export class BlockedAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlockedAddressError';
  }
}

// Ranges that are not on the public internet (IANA special-purpose registries)
const IPV4_BLOCKED: [string, number][] = [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, including cloud metadata services
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.88.99.0', 24], // 6to4 relay
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4] // reserved, and broadcast
];
const IPV6_BLOCKED: [string, number][] = [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64, which can lead to any IPv4 address
  ['64:ff9b:1::', 48], // local NAT64
  ['100::', 64], // discard
  ['2001::', 23], // IETF protocol assignments, including Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4, which can lead to any IPv4 address
  ['fc00::', 7], // unique local (private)
  ['fe80::', 10], // link-local
  ['fec0::', 10], // site-local
  ['ff00::', 8] // multicast
];

const blocked = new BlockList();
for (const [network, prefix] of IPV4_BLOCKED) blocked.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of IPV6_BLOCKED) blocked.addSubnet(network, prefix, 'ipv6');

// Whether an IP address is on the public internet. An IPv4 address written as
// IPv6 (::ffff:10.0.0.1) is checked as the IPv4 address it is.
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  return !blocked.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

// The address to connect to for a host name or IP literal, refusing the
// connection when the name resolves to any address that is not public
export async function publicAddressFor(hostname: string, allowed: (address: string) => boolean = isPublicAddress): Promise<string> {
  const host = hostname.replace(/^\[(.*)\]$/, '$1');
  const addresses = isIP(host) ? [host] : (await lookup(host, { all: true, verbatim: true })).map(a => a.address);
  const refused = addresses.find(address => !allowed(address));
  if (refused || addresses.length === 0) {
    throw new BlockedAddressError(`Refused ${host}: ${refused ? `${refused} is not a public internet address` : 'no address'}`);
  }
  return addresses[0];
}

// An HTTP agent that connects only to allowed addresses, checked as above.
// TLS still checks the certificate against the host name, not the address.
export function guardedAgent(allowed: (address: string) => boolean = isPublicAddress): Agent {
  const connect = buildConnector({});
  return new Agent({
    connect(options, callback) {
      const host = options.hostname.replace(/^\[(.*)\]$/, '$1');
      publicAddressFor(host, allowed).then(
        address => connect({ ...options, hostname: address, servername: options.servername || (isIP(host) ? undefined : host) }, callback),
        error => callback(error, null)
      );
    }
  });
}

// For every request to an address the server did not choose
export const publicOnly = guardedAgent();

import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import { withAbort } from '../util/single-flight';

export type ResolveHost = (hostname: string) => Promise<LookupAddress[]>;
export const resolveHost: ResolveHost = hostname => lookup(hostname, { all: true });
const privateAddresses = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const)
  privateAddresses.addSubnet(address, prefix, 'ipv4');
// IPv6 must be global unicast, excluding special-use and IPv4 transition ranges.
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
privateAddresses.addSubnet('2001::', 23, 'ipv6');
privateAddresses.addSubnet('2001:db8::', 32, 'ipv6');
privateAddresses.addSubnet('2002::', 16, 'ipv6');

export function isInternalHost(raw: string): boolean {
  const host = raw
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '')
    .toLowerCase();
  const family = isIP(host);
  if (family === 6) return !globalV6.check(host, 'ipv6') || privateAddresses.check(host, 'ipv6');
  if (family === 4) return privateAddresses.check(host, 'ipv4');
  return !host.includes('.') || /\.(localhost|local|internal)$/.test(host);
}

/** Resolve every answer, reject mixed public/private answers, and return one checked address. */
export async function publicAddress(
  url: URL,
  resolve: ResolveHost,
  signal: AbortSignal
): Promise<string> {
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isInternalHost(host)) throw new Error('Provider URL targets an internal address');
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await withAbort(resolve(host), signal);
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isIP(address) || isInternalHost(address))
  )
    throw new Error('Provider URL resolves to an internal or invalid address');
  return addresses[0].address;
}

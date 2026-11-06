import { resolve4 } from 'node:dns/promises';

/** k-rpc's routers, plus libtorrent's. */
export const DHT_ROUTERS = [
  'router.bittorrent.com:6881',
  'router.utorrent.com:6881',
  'dht.transmissionbt.com:6881',
  'dht.libtorrent.org:25401',
];

/**
 * The DHT bootstrap nodes as every IPv4 address of each router. Given hostnames, `node:dgram`
 * sends to the first address only, and under Bun a `udp4` socket may resolve them to IPv6 and
 * fail (`EINVAL`), so the DHT never bootstraps. Falls back to the hostnames when DNS gives
 * nothing in time.
 */
export async function resolveDhtBootstrap(
  routers: readonly string[] = DHT_ROUTERS,
  timeoutMs = 3_000
): Promise<string[]> {
  const addresses: string[][] = [];
  const lookup = Promise.all(
    routers.map(async (router, index) => {
      const [host, port] = router.split(':');
      try {
        addresses[index] = (await resolve4(host)).map(ip => `${ip}:${port}`);
      } catch {
        // Other routers may still resolve.
      }
    })
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>(resolve => {
    timer = setTimeout(resolve, timeoutMs);
    timer.unref?.();
  });
  try {
    await Promise.race([lookup, timeout]);
    const resolved = [...new Set(addresses.flat())];
    return resolved.length ? resolved : [...routers];
  } finally {
    clearTimeout(timer);
  }
}

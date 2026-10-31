import { probeServer } from './probe';
import { DEFAULT_SERVER_PORT } from './server-address';

/** The TV's own IPv4 address, from Tizen's system info; null off a TV or offline. */
export function getTvIpAddress(): Promise<string | null> {
  const systeminfo = typeof window !== 'undefined' ? window.tizen?.systeminfo : undefined;
  if (!systeminfo) return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      systeminfo.getPropertyValue('NETWORK', ({ networkType }) => {
        const property =
          networkType === 'ETHERNET'
            ? 'ETHERNET_NETWORK'
            : networkType === 'WIFI'
              ? 'WIFI_NETWORK'
              : null;
        if (!property) {
          resolve(null);
          return;
        }
        systeminfo.getPropertyValue(property, ({ ipAddress }) => resolve(ipAddress || null));
      });
    } catch {
      resolve(null);
    }
  });
}

export interface ScanOptions {
  port?: number;
  /** Probes in flight at once: TVs have few sockets to spare. */
  concurrency?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Called as each server answers, so the first ones show up before the scan ends. */
  onFound?: (url: string) => void;
}

/**
 * Probe every other host of the TV's /24 network for a Miauflix server, and resolve with the
 * servers that answered. A host with nothing listening costs one timeout, so it is kept short.
 */
export async function scanSubnet(
  ownIp: string,
  {
    port = DEFAULT_SERVER_PORT,
    concurrency = 32,
    timeoutMs = 1500,
    signal,
    onFound,
  }: ScanOptions = {}
): Promise<string[]> {
  const octets = ownIp.split('.');
  if (octets.length !== 4) return [];
  const prefix = octets.slice(0, 3).join('.');
  const hosts = Array.from({ length: 254 }, (_, index) => `${prefix}.${index + 1}`).filter(
    host => host !== ownIp
  );
  const found: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < hosts.length && !signal?.aborted) {
      const url = `http://${hosts[next++]}:${port}`;
      if (await probeServer(url, { timeoutMs, signal })) {
        found.push(url);
        onFound?.(url);
      }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return found;
}

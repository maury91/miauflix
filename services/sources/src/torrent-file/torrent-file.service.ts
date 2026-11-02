import type { Store } from '../db/store';
import type { HttpOptions } from '../http/http-client';
import type { HttpClient } from '../http/http-client';
import { normalizeHash } from '../normalize/magnet';
import type { Registry } from '../providers/registry';
import { SingleFlight } from '../util/single-flight';
export class TorrentFileService {
  private flights = new SingleFlight();
  constructor(
    private http: HttpClient,
    private open: (s: string) => string,
    private store: Store,
    private registry: Registry
  ) {}
  async resolve(
    hash: string,
    fileRef: string | undefined,
    signal: AbortSignal
  ): Promise<string | null> {
    const valid = normalizeHash(hash);
    if (!valid) return null;
    return this.flights.runCancelable(valid, signal, async signal => {
      const urls: string[] = [];
      const directOptions = new Map<string, HttpOptions>();
      if (fileRef)
        try {
          const data = JSON.parse(this.open(fileRef)) as { url: string; provider: string };
          const provider = (await this.registry.providers()).find(p => p.id === data.provider);
          if (provider) {
            urls.push(data.url);
            directOptions.set(data.url, {
              blockInternal: true,
              allowHosts: provider.hosts ?? [],
              ...provider.rate,
              maxRateWaitMs: 1000,
              beforeRequest: () =>
                this.store.reserve(provider.id, provider.rate.dailyBudget, 'interactive'),
            });
          }
        } catch {
          /* Legacy URL or invalid opaque reference: ignore. */
        }
      urls.push(
        `https://itorrents.org/torrent/${valid.toUpperCase()}.torrent`,
        `https://torrage.info/torrent.php?h=${valid}&ttl=${Math.floor(Date.now() / 1000)}`
      );
      for (let url of urls) {
        signal.throwIfAborted();
        try {
          let response = await this.http.request(url, {
            signal,
            maxBytes: 2 * 1024 * 1024,
            perMinute: 90,
            headers: { 'accept-encoding': 'identity' },
            ...directOptions.get(url),
          });
          if (url.includes('torrage.info')) {
            const text = await response.clone().text();
            const encrypted = text.match(/getTTL\("([^"]+)"/)?.[1];
            if (encrypted) {
              const ttl = encrypted
                .replace(/[a-z]/gi, c =>
                  String.fromCharCode(
                    ((c.charCodeAt(0) - (c <= 'Z' ? 65 : 97) - 12 + 26) % 26) + (c <= 'Z' ? 65 : 97)
                  )
                )
                .split('')
                .reverse()
                .join('');
              url = `https://torrage.info/download.php?h=${valid}&ttl=${encodeURIComponent(ttl)}`;
              response = await this.http.request(url, {
                signal,
                maxBytes: 2 * 1024 * 1024,
                perMinute: 90,
                headers: { 'accept-encoding': 'identity' },
              });
            }
          }
          if (!response.ok) continue;
          const bytes = Buffer.from(await response.arrayBuffer());
          if (bytes[0] === 100 && bytes.includes(Buffer.from('4:info')))
            return bytes.toString('base64');
        } catch {
          signal.throwIfAborted();
        }
      }
      return null;
    });
  }
}

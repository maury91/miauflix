import type { HttpClient } from '../../http/http-client';
import type { Provider, ProviderQuery, RawResult } from '../types';
export class EztvProvider implements Provider {
  readonly id = 'eztv';
  readonly name = 'EZTV';
  readonly kind = 'native' as const;
  readonly caps = { movie: [], tv: ['imdbid', 'page'], anime: [] } as Provider['caps'];
  readonly rate = { perMinute: 60, minIntervalMs: 500, dailyBudget: null };
  readonly requiresFlareSolverr = false;
  readonly maxPages = 3;
  constructor(private settings: Record<string, string | boolean> = {}) {}
  async search(query: ProviderQuery, ctx: { signal: AbortSignal; http: HttpClient }) {
    const url = new URL('/api/get-torrents', String(this.settings.baseUrl || 'https://eztvx.to'));
    url.searchParams.set('imdb_id', (query.imdbid ?? '').replace(/^tt/, ''));
    url.searchParams.set('limit', '100');
    url.searchParams.set('page', String(query.page ?? 1));
    const data = await ctx.http.json<{
      torrents_count: number;
      torrents?: {
        title: string;
        hash: string;
        magnet_url: string;
        seeds: number;
        peers: number;
        size_bytes: string;
        date_released_unix: number;
        season: string;
        episode: string;
        torrent_url: string;
      }[];
    }>(url.href, { signal: ctx.signal, ...this.rate, blockInternal: true });
    return {
      results: (data.torrents ?? []).map(
        (t): RawResult => ({
          title: t.title,
          hash: t.hash,
          magnet: t.magnet_url,
          seeders: t.seeds,
          leechers: t.peers,
          size: Number(t.size_bytes),
          date: new Date(t.date_released_unix * 1000),
          season: Number(t.season),
          episode: Number(t.episode),
          torrentUrl: t.torrent_url,
        })
      ),
      hasMore: data.torrents_count > (query.page ?? 1) * 100,
    };
  }
  async test(ctx: { signal: AbortSignal; http: HttpClient }) {
    try {
      await this.search({ kind: 'tv', imdbid: 'tt0944947' }, ctx);
      return { success: true, message: 'Provider reachable' };
    } catch {
      return { success: false, message: 'Provider unavailable' };
    }
  }
}

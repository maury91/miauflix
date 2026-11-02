import type { SourcesConfigService } from '../../config/config.service';
import { type HttpClient, HttpError, RateLimitError } from '../../http/http-client';
import type { Provider, ProviderQuery, RawResult } from '../types';

type Post = {
  name?: string;
  n?: string;
  info_hash?: string;
  h?: string;
  size?: number;
  s?: number;
  seeders?: number;
  se?: number;
  leechers?: number;
  le?: number;
  timestamp?: string;
  a?: string;
  imdb?: string;
  i?: string;
  files?: { name: string | string[]; full_location?: string }[];
  season?: number;
  episode?: number;
  type?: string;
  category_str?: string;
  language?: string;
};
export class TherarbgProvider implements Provider {
  readonly id = 'therarbg';
  readonly name = 'TheRARBG';
  readonly kind = 'native' as const;
  readonly caps = {
    movie: ['imdbid', 'q'],
    tv: ['imdbid', 'q', 'page'],
    anime: [],
  } as Provider['caps'];
  readonly rate = { perMinute: 60, minIntervalMs: 500, dailyBudget: null };
  readonly requiresFlareSolverr = false;
  readonly maxPages = 3;
  private readonly state = { mirror: 0 };
  constructor(private config: SourcesConfigService) {}
  async search(query: ProviderQuery, ctx: { signal: AbortSignal; http: HttpClient }) {
    const configured = this.config.value('THE_RARBG_API_URL');
    const mirrors = [...new Set([configured, 'https://therarbg.to', 'https://therar.site'])].filter(
      Boolean
    );
    const endpoint = query.imdbid
      ? `imdb-detail/${encodeURIComponent(query.imdbid)}/`
      : `get-posts/keywords:${encodeURIComponent(query.q ?? '')}:ncategory:XXX:order:-se/`;
    let error: unknown;
    for (let i = 0; i < mirrors.length; i++) {
      const index = (this.state.mirror + i) % mirrors.length;
      try {
        const url = new URL(endpoint, mirrors[index].replace(/\/$/, '') + '/');
        url.searchParams.set('format', 'json');
        if (query.page) url.searchParams.set('page', String(query.page));
        const response = await ctx.http.request(url.href, {
          signal: ctx.signal,
          redirect: 'manual',
          ...this.rate,
        });
        if (
          response.status === 404 ||
          (response.status === 302 && response.headers.get('location') === '/')
        )
          return { results: [], hasMore: false };
        if (!response.ok) throw new HttpError(response.status, response.headers.get('retry-after'));
        const data = (await response.json()) as {
          imdb?: { runtime?: string };
          trb_posts?: Post[];
          results?: Post[];
          links?: { next?: string };
        };
        this.state.mirror = index;
        return {
          results: (data.trb_posts ?? data.results ?? []).map(
            (p): RawResult => ({
              title: p.name ?? p.n ?? '',
              type: p.type,
              category: p.category_str,
              runtimeMinutes: data.imdb?.runtime ? parseInt(data.imdb.runtime, 10) / 60 : undefined,
              trackerMetadata: {
                language: p.language,
                season: p.season,
                episode: p.episode,
                runtime: data.imdb?.runtime ? parseInt(data.imdb.runtime, 10) : undefined,
              },
              hash: p.info_hash ?? p.h,
              size: p.size ?? p.s,
              seeders: p.seeders ?? p.se,
              leechers: p.leechers ?? p.le,
              date: p.timestamp ?? p.a,
              imdbid: p.imdb ?? p.i,
              files: p.files?.map(
                f => f.full_location ?? (Array.isArray(f.name) ? f.name.join('/') : f.name)
              ),
              season: p.season,
              episode: p.episode,
            })
          ),
          hasMore: !!data.links?.next,
        };
      } catch (e) {
        ctx.signal.throwIfAborted();
        if (e instanceof RateLimitError || (e instanceof HttpError && e.status === 429)) throw e;
        error = e;
      }
    }
    throw error;
  }
  async test(ctx: { signal: AbortSignal; http: HttpClient }) {
    try {
      await this.search({ kind: 'movie', q: 'test' }, ctx);
      return { success: true, message: 'Provider reachable' };
    } catch {
      return { success: false, message: 'Provider unavailable' };
    }
  }
}

import type { SourcesConfigService } from '../../config/config.service';
import { type HttpClient, HttpError, RateLimitError } from '../../http/http-client';
import type { Provider, ProviderQuery, RawResult } from '../types';

type YtsMovie = {
  title_long: string;
  imdb_code: string;
  yt_trailer_code?: string;
  runtime?: number;
  language?: string;
  torrents?: {
    hash: string;
    url: string;
    quality: string;
    type: string;
    video_codec: string;
    bit_depth?: string;
    audio_channels?: string;
    size_bytes: number;
    seeds: number;
    peers: number;
    date_uploaded: string;
  }[];
};
const FALLBACK_DOMAINS = ['yts.lt', 'yts.gg', 'yts.am', 'yts.ag'];

/** Parse only the official service group, using Bun's native HTML parser. */
export async function parseMirrorDomains(html: string): Promise<string[]> {
  const groups: Array<{ official: boolean; links: string[] }> = [];
  const domains = new Set<string>();
  let heading = '';
  const rewriter = new HTMLRewriter()
    .on('section, .serviceGroup', {
      element(element) {
        const group = { official: false, links: [] as string[] };
        groups.push(group);
        element.onEndTag(() => {
          if (group.official)
            for (const href of group.links) {
              try {
                const url = new URL(href);
                if (url.protocol === 'https:' && !url.username && !url.password)
                  domains.add(url.hostname.toLowerCase());
              } catch {
                /* Ignore invalid links. */
              }
            }
          groups.splice(groups.indexOf(group), 1);
        });
      },
    })
    .on('h2', {
      element(element) {
        heading = '';
        element.onEndTag(() => {
          if (groups.length && /official/i.test(heading)) groups[groups.length - 1].official = true;
        });
      },
      text(text) {
        heading += text.text;
      },
    })
    .on('a', {
      element(element) {
        const href = element.getAttribute('href');
        if (href) for (const group of groups) group.links.push(href);
      },
    });
  await rewriter.transform(new Response(html)).text();
  return [...domains];
}

export class YtsProvider implements Provider {
  readonly id = 'yts';
  readonly name = 'YTS';
  readonly kind = 'native' as const;
  readonly caps = { movie: ['imdbid', 'q'], tv: [], anime: [] } as Provider['caps'];
  readonly rate = { perMinute: 60, minIntervalMs: 500, dailyBudget: null };
  readonly requiresFlareSolverr = false;
  readonly maxPages = 1;
  // Registry views inherit this shared state while overriding identity and rate settings.
  private readonly mirrorState: {
    discovered?: { until: number; domains: string[] };
    preferred?: string;
  } = {};
  constructor(private config: SourcesConfigService) {}

  private async mirrors(ctx: { signal: AbortSignal; http: HttpClient }): Promise<string[]> {
    if (this.mirrorState.discovered && this.mirrorState.discovered.until > Date.now())
      return this.mirrorState.discovered.domains;
    let domains = FALLBACK_DOMAINS;
    try {
      const response = await ctx.http.request('https://yifystatus.com/', {
        signal: ctx.signal,
        timeoutMs: 10_000,
        blockInternal: true,
        maxBytes: 1024 * 1024,
      });
      if (!response.ok) throw new HttpError(response.status, response.headers.get('retry-after'));
      const found = await parseMirrorDomains(await response.text());
      if (found.length) domains = found;
    } catch (error) {
      ctx.signal.throwIfAborted();
      if (error instanceof RateLimitError) throw error;
    }
    this.mirrorState.discovered = { until: Date.now() + 3600_000, domains };
    return domains;
  }

  async search(query: ProviderQuery, ctx: { signal: AbortSignal; http: HttpClient }) {
    const configured = this.config.value('YTS_API_URL') || 'https://yts.mx';
    const custom = new URL(configured).hostname !== 'yts.mx';
    const attempted = new Set<string>();
    const read = async (base: string) => {
      attempted.add(base);
      const root = base.replace(/\/+$/, '');
      const api = root.endsWith('/api/v2') ? root : `${root}/api/v2`;
      const url = new URL(`${api}/list_movies.json`);
      url.searchParams.set('query_term', query.imdbid ?? query.q ?? '');
      url.searchParams.set('page', '1');
      url.searchParams.set('limit', '20');
      const data = await ctx.http.json<{ status: string; data?: { movies?: YtsMovie[] } }>(
        url.href,
        { signal: ctx.signal, blockInternal: !custom }
      );
      if (data.status !== 'ok') throw new Error('YTS invalid response');
      return {
        results: (data.data?.movies ?? []).flatMap(movie =>
          (movie.torrents ?? []).map(
            (source): RawResult => ({
              title: `${movie.title_long} ${source.quality} ${source.type} ${source.video_codec}`,
              hash: source.hash,
              torrentUrl: source.url,
              size: source.size_bytes,
              seeders: source.seeds,
              leechers: source.peers,
              date: source.date_uploaded,
              imdbid: movie.imdb_code,
              trailerCode: movie.yt_trailer_code,
              runtimeMinutes: movie.runtime,
              trackerMetadata: {
                quality: source.quality,
                videoCodec: source.video_codec,
                bitDepth: source.bit_depth,
                audioChannels: source.audio_channels,
                sourceType: source.type,
                language: movie.language,
                runtime: movie.runtime ? movie.runtime * 60 : undefined,
              },
            })
          )
        ),
        hasMore: false,
      };
    };
    let lastError: unknown;
    try {
      return await read(custom ? configured : (this.mirrorState.preferred ?? configured));
    } catch (error) {
      ctx.signal.throwIfAborted();
      if (
        custom ||
        error instanceof RateLimitError ||
        (error instanceof HttpError && error.status === 429)
      )
        throw error;
      lastError = error;
    }
    for (const domain of await this.mirrors(ctx)) {
      const base = `https://${domain}/api/v2`;
      if (attempted.has(base)) continue;
      try {
        const result = await read(base);
        this.mirrorState.preferred = base;
        return result;
      } catch (error) {
        ctx.signal.throwIfAborted();
        if (error instanceof RateLimitError || (error instanceof HttpError && error.status === 429))
          throw error;
        lastError = error;
      }
    }
    throw lastError;
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

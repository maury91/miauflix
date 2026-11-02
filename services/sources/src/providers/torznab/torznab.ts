import type { ProviderSetting } from '@miauflix/service-contracts';
import * as cheerio from 'cheerio';

import type { HttpClient } from '../../http/http-client';
import { normalizeHash } from '../../normalize/magnet';
import { resolveHashes } from '../torrent-hash';
import type {
  Param,
  Provider,
  ProviderCaps,
  ProviderPage,
  ProviderQuery,
  RawResult,
} from '../types';

type Settings = Record<string, string | boolean>;
const CAPS_TTL_MS = 24 * 3600_000;
const FAILED_CAPS_TTL_MS = 5 * 60_000;
const SUPPORTED: Record<string, Param> = {
  q: 'q',
  imdbid: 'imdbid',
  tmdbid: 'tmdbid',
  tvdbid: 'tvdbid',
  season: 'season',
  ep: 'ep',
};
const DEFAULT_CAPS: ProviderCaps = {
  movie: ['q', 'imdbid'],
  tv: ['q', 'imdbid', 'season', 'ep'],
  anime: [],
};
const CATEGORY = { movie: '2000', tv: '5000', anime: '5070' } as const;

export const torznabSettings: ProviderSetting[] = [
  { name: 'apiKey', type: 'password', label: 'API key' },
];

interface TorznabCapabilities {
  caps: ProviderCaps;
  modes: { movie: 'movie' | 'search'; tv: 'tvsearch' | 'search' };
}
const DEFAULT_CAPABILITIES: TorznabCapabilities = {
  caps: DEFAULT_CAPS,
  modes: { movie: 'movie', tv: 'tvsearch' },
};

/** Keep wire search modes separate from the planner's supported parameters. */
function readCapabilities(xml: string): TorznabCapabilities {
  const $ = cheerio.load(xml, { xmlMode: true });
  const params = (mode: string): Param[] | null => {
    const node = $(`searching > ${mode}`).first();
    if (!node.length || node.attr('available') !== 'yes') return null;
    return [
      ...new Set(
        (node.attr('supportedParams') ?? '')
          .split(',')
          .map(token => SUPPORTED[token.trim()])
          .filter((param): param is Param => !!param)
      ),
    ];
  };
  const search = params('search');
  const withQ = (list: Param[] | null): Param[] =>
    list ? [...new Set<Param>(['q', ...list])] : search ? ['q'] : [];
  const movie = params('movie-search');
  const tv = params('tv-search');
  const tvCaps = withQ(tv);
  return {
    caps: {
      movie: withQ(movie),
      tv: tvCaps,
      anime: tvCaps.includes('q') ? ['q'] : [],
    },
    modes: { movie: movie ? 'movie' : 'search', tv: tv ? 'tvsearch' : 'search' },
  };
}

/** Torznab capabilities document to our params per mode. */
export function parseCaps(xml: string): ProviderCaps {
  return readCapabilities(xml).caps;
}

const attr = (item: cheerio.Cheerio<never>, name: string): string | undefined =>
  item.find(`torznab\\:attr[name="${name}"], newznab\\:attr[name="${name}"]`).first().attr('value');
const integer = (value: string | undefined): number | undefined => {
  const parsed = value === undefined ? NaN : parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export function parseItems(xml: string): { results: RawResult[]; error: string | null } {
  const $ = cheerio.load(xml, { xmlMode: true });
  const error = $('error').first();
  if (error.length) return { results: [], error: error.attr('description') ?? 'Indexer error' };
  const results: RawResult[] = [];
  $('item').each((_, element) => {
    const item = $(element) as unknown as cheerio.Cheerio<never>;
    const title = item.children('title').first().text().trim();
    if (!title) return;
    const link = item.children('link').first().text().trim();
    const enclosure = item.children('enclosure').first().attr('url');
    const seeders = integer(attr(item, 'seeders'));
    const peers = integer(attr(item, 'peers'));
    const magnet = [attr(item, 'magneturl'), link, enclosure].find(value =>
      value?.startsWith('magnet:')
    );
    const url = [enclosure, link].find(value => value && /^https?:/.test(value));
    const pubDate = item.children('pubDate').first().text();
    const date = pubDate ? new Date(pubDate) : null;
    results.push({
      title,
      hash: normalizeHash(attr(item, 'infohash') ?? '') ?? undefined,
      magnet,
      torrentUrl: url,
      size:
        integer(attr(item, 'size')) ??
        integer(item.children('size').first().text()) ??
        integer(item.children('enclosure').first().attr('length')),
      seeders,
      leechers:
        peers !== undefined && seeders !== undefined ? Math.max(0, peers - seeders) : undefined,
      date: date && Number.isFinite(date.getTime()) ? date.toISOString() : undefined,
      imdbid: attr(item, 'imdbid') ? `tt${attr(item, 'imdbid')!.replace(/^tt/, '')}` : undefined,
      category: attr(item, 'category'),
    });
  });
  return { results, error: null };
}

export class TorznabProvider implements Provider {
  readonly kind = 'torznab' as const;
  readonly rate: Provider['rate'] = { perMinute: 30, minIntervalMs: 1000, dailyBudget: null };
  readonly requiresFlareSolverr = false;
  readonly maxPages = 1;
  readonly settingsSchema = torznabSettings;
  readonly hosts: string[];
  /** Shared by every copy the registry makes, so capabilities are fetched once per day. */
  private readonly state: { capabilities: TorznabCapabilities; until: number } = {
    capabilities: DEFAULT_CAPABILITIES,
    until: 0,
  };

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly baseUrl: string,
    private readonly settings: Settings = {},
    private readonly now: () => number = Date.now
  ) {
    this.hosts = [new URL(baseUrl).host];
  }

  get caps(): ProviderCaps {
    return this.state.capabilities.caps;
  }

  private url(params: Record<string, string | number | undefined>): string {
    const url = new URL(this.baseUrl);
    for (const [key, value] of Object.entries(params))
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    const apiKey = this.settings.apiKey;
    if (typeof apiKey === 'string' && apiKey) url.searchParams.set('apikey', apiKey);
    return url.href;
  }

  /** Loads capabilities when stale; on failure keeps sensible defaults for a few minutes. */
  async prepare(ctx: { signal: AbortSignal; http: HttpClient }): Promise<void> {
    if (this.state.until > this.now()) return;
    try {
      const response = await ctx.http.request(this.url({ t: 'caps' }), { signal: ctx.signal });
      if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
      const capabilities = readCapabilities(await response.text());
      if (!capabilities.caps.movie.length && !capabilities.caps.tv.length)
        throw new Error('No search modes advertised');
      this.state.capabilities = capabilities;
      this.state.until = this.now() + CAPS_TTL_MS;
    } catch {
      ctx.signal.throwIfAborted();
      this.state.capabilities = DEFAULT_CAPABILITIES;
      this.state.until = this.now() + FAILED_CAPS_TTL_MS;
    }
  }

  private async fetchItems(
    ctx: { signal: AbortSignal; http: HttpClient },
    params: Record<string, string | number | undefined>
  ): Promise<{ results: RawResult[]; error: string | null }> {
    const response = await ctx.http.request(this.url(params), { signal: ctx.signal });
    if (!response.ok) throw new Error(`Indexer HTTP ${response.status}`);
    return parseItems(await response.text());
  }

  async search(
    query: ProviderQuery,
    ctx: { signal: AbortSignal; http: HttpClient }
  ): Promise<ProviderPage> {
    const base = {
      t: query.kind === 'anime' ? 'search' : this.state.capabilities.modes[query.kind],
      q: query.q,
      tmdbid: query.tmdbid,
      tvdbid: query.tvdbid,
      season: query.season,
      ep: query.ep,
      cat: CATEGORY[query.kind],
      limit: 100,
    };
    let page: { results: RawResult[]; error: string | null };
    if (query.imdbid) {
      const digits = query.imdbid.replace(/^tt/, '');
      // Prowlarr wants the "tt" prefix and Jackett digits only; try one and fall back once.
      page = await this.fetchItems(ctx, { ...base, imdbid: `tt${digits}` });
      if (page.error || !page.results.length) {
        const retry = await this.fetchItems(ctx, { ...base, imdbid: digits });
        if (!retry.error && retry.results.length) page = retry;
      }
    } else page = await this.fetchItems(ctx, base);
    if (page.error) throw new Error(page.error);
    return {
      results: await resolveHashes(page.results, { ...ctx, hosts: this.hosts }),
      hasMore: false,
    };
  }

  async test(ctx: { signal: AbortSignal; http: HttpClient }) {
    try {
      const response = await ctx.http.request(this.url({ t: 'caps' }), { signal: ctx.signal });
      if (!response.ok)
        return { success: false, message: `Indexer returned HTTP ${response.status}` };
      const caps = parseCaps(await response.text());
      return caps.movie.length || caps.tv.length
        ? { success: true, message: 'Connected; the indexer supports movie or TV search' }
        : { success: false, message: 'The indexer does not advertise movie or TV search' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message.slice(0, 300) : 'Test failed',
      };
    }
  }
}

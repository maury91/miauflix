import type { ProviderSetting } from '@miauflix/service-contracts';
import { z } from 'zod';

import type { HttpClient } from '../../http/http-client';
import { normalizeHash } from '../../normalize/magnet';
import { parseSize } from '../cardigann/filters';
import type {
  Param,
  Provider,
  ProviderCaps,
  ProviderPage,
  ProviderQuery,
  RawResult,
} from '../types';

const MANIFEST_TTL_MS = 24 * 3600_000;
const FAILED_MANIFEST_TTL_MS = 5 * 60_000;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_STREAMS_BYTES = 4 * 1024 * 1024;
const MOVIE: Param[] = ['imdbid'];
const SERIES: Param[] = ['imdbid', 'season', 'ep'];
/** What an addon is assumed to offer until its manifest has been read: Torrentio's shape. */
const DEFAULT_CAPS: ProviderCaps = { movie: MOVIE, tv: SERIES, anime: [] };

export const stremioSettings: ProviderSetting[] = [
  // The addon's own configuration (providers, filters, debrid keys) is part of the URL.
  { name: 'manifestUrl', type: 'password', label: 'Addon URL (manifest.json)' },
];

const resource = z.union([
  z.string(),
  z.object({
    name: z.string(),
    types: z.array(z.string()).optional(),
    idPrefixes: z.array(z.string()).optional(),
  }),
]);
const manifestSchema = z.object({
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  version: z.string().max(50).optional(),
  description: z.string().max(2000).optional(),
  types: z.array(z.string()).default([]),
  resources: z.array(resource).default([]),
  idPrefixes: z.array(z.string()).optional(),
  behaviorHints: z
    .object({
      configurable: z.boolean().optional(),
      configurationRequired: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
});
export type StremioManifest = z.infer<typeof manifestSchema>;

const streamSchema = z
  .object({
    name: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    infoHash: z.string().optional(),
    fileIdx: z.number().optional(),
    sources: z.array(z.string()).optional(),
    behaviorHints: z
      .object({ filename: z.string().optional(), videoSize: z.number().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
const streamsSchema = z.object({ streams: z.array(z.unknown()).default([]) });

/** `stremio://host/…` (the install link addons show) and a bare base URL both mean the manifest. */
export function normalizeManifestUrl(input: string): URL {
  let text = input.trim().replace(/^stremio:\/\//i, 'https://');
  if (!/\/manifest\.json$/i.test(new URL(text).pathname))
    text = `${text.replace(/\/+$/, '')}/manifest.json`;
  const url = new URL(text);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('The addon URL must be http(s) without credentials');
  url.hash = '';
  return url;
}

/** Whether the addon answers stream requests of a type for IMDb ids (`tt…`). */
function streamsFor(manifest: StremioManifest, type: 'movie' | 'series'): boolean {
  return manifest.resources.some(entry => {
    const name = typeof entry === 'string' ? entry : entry.name;
    if (name !== 'stream') return false;
    const types = (typeof entry === 'string' ? undefined : entry.types) ?? manifest.types;
    const prefixes =
      (typeof entry === 'string' ? undefined : entry.idPrefixes) ?? manifest.idPrefixes;
    return types.includes(type) && (!prefixes?.length || prefixes.some(p => 'tt'.startsWith(p)));
  });
}

export function capsOf(manifest: StremioManifest): ProviderCaps {
  return {
    movie: streamsFor(manifest, 'movie') ? MOVIE : [],
    tv: streamsFor(manifest, 'series') ? SERIES : [],
    anime: [],
  };
}

export function parseManifest(body: unknown): StremioManifest {
  const parsed = manifestSchema.safeParse(body);
  if (!parsed.success) throw new Error('This is not a Stremio addon manifest');
  return parsed.data;
}

// Addons describe a stream in free text, a line per fact, marked with emoji:
// Torrentio "Release.Name\nfile.mkv\n👤 12 💾 1.4 GB ⚙️ Site", MediaFusion "📂 Release.Name", ...
const FACTS = /👤|💾|⚙️|🔗|🌐|📹|🔊|🔍|🔎|⬇️|⬆️|🧲/u;
const LEADING_SYMBOLS = /^[^\p{L}\p{N}[(]+/u;

/** The release a stream comes from: its first line of plain text, else its file name. */
function releaseName(text: string, filename?: string, name?: string): string {
  for (const line of text.split('\n')) {
    const clean = line.replace(LEADING_SYMBOLS, '').trim();
    if (clean && !FACTS.test(line)) return clean;
  }
  return filename?.trim() || name?.replace(/\s+/g, ' ').trim() || '';
}

/** One Stremio stream as a search result; streams that are not torrents give none. */
export function streamToResult(
  raw: unknown,
  imdbid: string,
  kind: 'movie' | 'tv'
): RawResult | null {
  const parsed = streamSchema.safeParse(raw);
  if (!parsed.success) return null;
  const stream = parsed.data;
  const hash = normalizeHash(stream.infoHash ?? '');
  if (!hash) return null;
  const text = stream.description ?? stream.title ?? '';
  const filename = stream.behaviorHints?.filename;
  const title = releaseName(text, filename, stream.name);
  if (!title) return null;
  const seeders = /👤\s*(\d+)/u.exec(text)?.[1];
  const size = /💾\s*([\d.,]+\s*[KMGTP]i?B)/iu.exec(text)?.[1];
  const trackers = (stream.sources ?? [])
    .filter(source => source.startsWith('tracker:'))
    .map(source => source.slice('tracker:'.length));
  const params = new URLSearchParams({ xt: `urn:btih:${hash}` });
  for (const tracker of trackers) params.append('tr', tracker);
  return {
    title,
    hash,
    magnet: `magnet:?${params}`,
    // The torrent's size when the addon states it; the file's otherwise.
    size: (size ? parseSize(size) : null) ?? stream.behaviorHints?.videoSize,
    seeders: seeders === undefined ? undefined : Number(seeders),
    imdbid,
    category: kind === 'movie' ? 'Movies' : 'TV',
    files: filename && filename !== title ? [filename] : undefined,
  };
}

export class StremioProvider implements Provider {
  readonly kind = 'stremio' as const;
  // Public addons are shared services that block abusive addresses: stay well under their limits.
  readonly rate: Provider['rate'] = { perMinute: 20, minIntervalMs: 2000, dailyBudget: null };
  readonly requiresFlareSolverr = false;
  readonly maxPages = 1;
  readonly settingsSchema = stremioSettings;
  readonly hosts: string[];
  private readonly base: string;
  /** Shared by every copy the registry makes, so the manifest is fetched once per day. */
  private readonly state: { manifest: StremioManifest | null; until: number } = {
    manifest: null,
    until: 0,
  };

  constructor(
    readonly id: string,
    readonly name: string,
    private readonly manifestUrl: string,
    private readonly now: () => number = Date.now
  ) {
    const url = normalizeManifestUrl(manifestUrl);
    this.hosts = [url.host];
    this.base = url.href.replace(/\/manifest\.json$/i, '');
  }

  get caps(): ProviderCaps {
    return this.state.manifest ? capsOf(this.state.manifest) : DEFAULT_CAPS;
  }

  /** The manifest's first sentence: addons often follow it with long lists of what they search. */
  get description(): string | undefined {
    const text = this.state.manifest?.description?.split('\n')[0]?.trim();
    return text?.match(/^.{1,200}?[.!?](?=\s|$)/u)?.[0] ?? (text?.slice(0, 200) || undefined);
  }

  private async manifest(ctx: { signal: AbortSignal; http: HttpClient }): Promise<StremioManifest> {
    const response = await ctx.http.request(normalizeManifestUrl(this.manifestUrl).href, {
      signal: ctx.signal,
      maxBytes: MAX_MANIFEST_BYTES,
    });
    if (!response.ok) throw new Error(`Addon HTTP ${response.status}`);
    return parseManifest(await response.json());
  }

  /** Reads the manifest when stale; on failure keeps what is known for a few minutes. */
  async prepare(ctx: { signal: AbortSignal; http: HttpClient }): Promise<void> {
    if (this.state.until > this.now()) return;
    try {
      this.state.manifest = await this.manifest(ctx);
      this.state.until = this.now() + MANIFEST_TTL_MS;
    } catch {
      ctx.signal.throwIfAborted();
      this.state.until = this.now() + FAILED_MANIFEST_TTL_MS;
    }
  }

  async search(
    query: ProviderQuery,
    ctx: { signal: AbortSignal; http: HttpClient }
  ): Promise<ProviderPage> {
    if (!query.imdbid || query.kind === 'anime') return { results: [], hasMore: false };
    const imdbid = `tt${query.imdbid.replace(/^tt/, '')}`;
    // Addons answer for one episode; packs holding it are among the results. Without an
    // episode (a season-pack search) the season's first episode finds the packs.
    const path =
      query.kind === 'movie'
        ? `movie/${imdbid}`
        : `series/${imdbid}:${query.season ?? 1}:${query.ep ?? 1}`;
    const response = await ctx.http.request(`${this.base}/stream/${path}.json`, {
      signal: ctx.signal,
      maxBytes: MAX_STREAMS_BYTES,
    });
    if (!response.ok) throw new Error(`Addon HTTP ${response.status}`);
    const parsed = streamsSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('The addon returned an unreadable stream list');
    return {
      results: parsed.data.streams.flatMap(
        stream => streamToResult(stream, imdbid, query.kind === 'movie' ? 'movie' : 'tv') ?? []
      ),
      hasMore: false,
    };
  }

  async test(ctx: { signal: AbortSignal; http: HttpClient }) {
    try {
      const manifest = await this.manifest(ctx);
      const caps = capsOf(manifest);
      if (!caps.movie.length && !caps.tv.length)
        return {
          success: false,
          message: 'The addon does not offer streams for movies or series by IMDb id',
        };
      return { success: true, message: `Connected to ${manifest.name}` };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message.slice(0, 300) : 'Test failed',
      };
    }
  }
}

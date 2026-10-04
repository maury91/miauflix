import type { PlaybackEntry, PlaybackProgress } from '@miauflix/service-contracts';
import { z } from 'zod';

import { retryAfterMs, withTraktRequestSlot } from './trakt-rate-limit';

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
let traktCooldownUntil = 0;

const waitForCooldown = async (): Promise<void> => {
  while (true) {
    const remaining = traktCooldownUntil - Date.now();
    if (remaining <= 0) return;
    await new Promise<void>(resolve => setTimeout(resolve, Math.min(remaining, 30_000)));
  }
};

const deviceCodeSchema = z.object({
  device_code: z.string().min(1),
  user_code: z.string().min(1),
  verification_url: z.string().url(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive(),
});
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.number().int().positive(),
});
const profileSchema = z.object({
  username: z.string().min(1),
  ids: z.object({ slug: z.string().min(1) }),
});
const popularListSchema = z.object({
  list: z.object({
    name: z.string(),
    description: z.string(),
    item_count: z.number().int().nonnegative(),
    user: z.object({ ids: z.object({ slug: z.string().min(1) }) }),
    ids: z.object({ trakt: z.number().int().positive(), slug: z.string().min(1) }),
  }),
});

export class TraktProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
  }
}

export class TraktClient {
  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    private readonly apiUrl: string,
    private readonly redirectUri: string,
    private readonly requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  ) {}

  private requestWithHeaders(
    path: string,
    init: RequestInit = {},
    accessToken?: string
  ): Promise<{ data: unknown; headers: Headers }> {
    return withTraktRequestSlot(init.method ?? 'GET', () =>
      this.performRequest(path, init, accessToken)
    );
  }

  private async performRequest(
    path: string,
    init: RequestInit = {},
    accessToken?: string
  ): Promise<{ data: unknown; headers: Headers }> {
    try {
      await waitForCooldown();
      const response = await fetch(`${this.apiUrl}${path}`, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(this.requestTimeoutMs),
        headers: {
          'trakt-api-version': '2',
          'trakt-api-key': this.clientId,
          'content-type': 'application/json',
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...(init.headers ?? {}),
        },
      });
      if (!response.ok) {
        const body = await response.text();
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          traktCooldownUntil = Math.max(traktCooldownUntil, Date.now() + retryAfterMs(retryAfter));
        }
        throw new TraktProviderError(`Trakt API ${response.status}: ${body}`, response.status);
      }
      try {
        return { data: await response.json(), headers: response.headers };
      } catch (error) {
        if (
          error instanceof Error &&
          (error.name === 'AbortError' || error.name === 'TimeoutError')
        )
          throw error;
        throw new TraktProviderError('Trakt API returned invalid JSON', 502);
      }
    } catch (error) {
      if (error instanceof TraktProviderError) throw error;
      if (
        error instanceof Error &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        throw new TraktProviderError('Trakt API request timed out', 504);
      }
      throw error;
    }
  }

  private async request<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {},
    accessToken?: string
  ): Promise<T> {
    const { data } = await this.requestWithHeaders(path, init, accessToken);
    try {
      return schema.parse(data);
    } catch {
      throw new TraktProviderError('Trakt API returned an invalid response', 502);
    }
  }

  test(): Promise<unknown[]> {
    return this.request('/movies/popular?limit=1', z.array(z.unknown()));
  }

  deviceCode(): Promise<z.infer<typeof deviceCodeSchema>> {
    return this.request('/oauth/device/code', deviceCodeSchema, {
      method: 'POST',
      body: JSON.stringify({ client_id: this.clientId }),
    });
  }

  deviceToken(code: string): Promise<z.infer<typeof tokenSchema>> {
    return this.request('/oauth/device/token', tokenSchema, {
      method: 'POST',
      body: JSON.stringify({ code, client_id: this.clientId, client_secret: this.clientSecret }),
    });
  }

  refreshToken(refreshToken: string): Promise<z.infer<typeof tokenSchema>> {
    return this.request('/oauth/token', tokenSchema, {
      method: 'POST',
      body: JSON.stringify({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'refresh_token',
      }),
    });
  }

  profile(accessToken: string): Promise<z.infer<typeof profileSchema>> {
    return this.request('/users/me', profileSchema, {}, accessToken);
  }

  popularLists(
    page: number,
    limit: number
  ): Promise<{
    items: z.infer<typeof popularListSchema>[];
    totalPages: number;
    totalItems: number;
  }> {
    return this.page<unknown>(`/lists/popular?page=${page}&limit=${limit}`).then(result => {
      const parsed = z.array(popularListSchema).safeParse(result.items);
      if (!parsed.success)
        throw new TraktProviderError('Trakt API returned invalid popular lists', 502);
      return { ...result, items: parsed.data };
    });
  }

  revoke(accessToken: string): Promise<unknown> {
    return this.request('/oauth/revoke', z.unknown(), {
      method: 'POST',
      body: JSON.stringify({
        token: accessToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });
  }

  async playback(accessToken: string): Promise<PlaybackEntry[]> {
    const media = z.object({
      ids: z.object({ tmdb: z.number().int().positive().nullish() }),
      runtime: z.number().finite().positive().nullish(),
    });
    const schema = z
      .discriminatedUnion('type', [
        z.object({ type: z.literal('movie'), movie: media }),
        z.object({
          type: z.literal('episode'),
          show: media,
          episode: z.object({
            season: z.number().int().nonnegative(),
            number: z.number().int().positive(),
            runtime: z.number().finite().positive().nullish(),
          }),
        }),
      ])
      .and(
        z.object({
          progress: z.number().finite().min(0).max(100),
          paused_at: z.string().datetime({ offset: true }),
        })
      );
    const entries: z.infer<typeof schema>[] = [];
    for (let page = 1; ; page++) {
      const response = await this.requestWithHeaders(
        `/sync/playback?extended=full&page=${page}&limit=100`,
        {},
        accessToken
      );
      const parsed = schema.array().safeParse(response.data);
      if (!parsed.success)
        throw new TraktProviderError('Trakt API returned an invalid response', 502);
      entries.push(...parsed.data);
      const count = response.headers.get('X-Pagination-Page-Count');
      if (count === null) break; // Trakt also exposes non-paginated playback responses.
      if (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count)))
        throw new TraktProviderError('Trakt API returned invalid playback pagination', 502);
      if (page >= Number(count)) break;
    }
    return entries.flatMap(entry => {
      const runtime =
        entry.type === 'movie'
          ? entry.movie.runtime
          : (entry.episode.runtime ?? entry.show.runtime);
      const id = entry.type === 'movie' ? entry.movie.ids.tmdb : entry.show.ids.tmdb;
      // Items without a catalog identity or runtime cannot be resumed safely.
      if (!id || !runtime) return [];
      const durationSeconds = runtime * 60;
      return [
        {
          playable:
            entry.type === 'movie'
              ? { kind: 'movie' as const, mediaId: id }
              : {
                  kind: 'episode' as const,
                  showMediaId: id,
                  seasonNumber: entry.episode.season,
                  episodeNumber: entry.episode.number,
                },
          positionSeconds: (durationSeconds * entry.progress) / 100,
          durationSeconds,
          state: 'paused' as const,
          updatedAt: entry.paused_at,
        },
      ];
    });
  }

  async scrobble(update: PlaybackProgress, accessToken: string): Promise<void> {
    const percent =
      update.state === 'completed' ? 100 : (update.positionSeconds / update.durationSeconds) * 100;
    const action =
      update.state === 'completed' || (update.state === 'paused' && percent > 80)
        ? 'stop'
        : update.state === 'paused'
          ? 'pause'
          : 'start';
    const playable = update.playable;
    const media =
      playable.kind === 'movie'
        ? { movie: { ids: { tmdb: playable.mediaId } } }
        : {
            show: { ids: { tmdb: playable.showMediaId } },
            episode: { season: playable.seasonNumber, number: playable.episodeNumber },
          };
    try {
      await this.request(
        `/scrobble/${action}`,
        z.unknown(),
        {
          method: 'POST',
          body: JSON.stringify({
            ...media,
            progress: percent,
          }),
        },
        accessToken
      );
    } catch (error) {
      // Trakt's duplicate-scrobble response means the completion is already recorded.
      if (action === 'stop' && error instanceof TraktProviderError && error.status === 409) return;
      throw error;
    }
  }

  async watchedHistory(accessToken: string, since?: string): Promise<PlaybackEntry[]> {
    const itemSchema = z.object({
      type: z.enum(['movie', 'episode']),
      watched_at: z.string().datetime({ offset: true }),
      movie: z
        .object({ ids: z.object({ tmdb: z.number().int().positive().nullish() }) })
        .optional(),
      show: z.object({ ids: z.object({ tmdb: z.number().int().positive().nullish() }) }).optional(),
      episode: z
        .object({ season: z.number().int().nonnegative(), number: z.number().int().positive() })
        .optional(),
    });
    const entries: PlaybackEntry[] = [];
    for (let page = 1; ; page++) {
      const result = await this.page(
        `/sync/history?page=${page}&limit=100${since ? `&start_at=${encodeURIComponent(since)}` : ''}`,
        accessToken
      );
      const parsed = itemSchema.array().safeParse(result.items);
      if (!parsed.success)
        throw new TraktProviderError('Trakt API returned invalid watched history', 502);
      for (const item of parsed.data) {
        const playable =
          item.type === 'movie' && item.movie?.ids.tmdb
            ? { kind: 'movie' as const, mediaId: item.movie.ids.tmdb }
            : item.type === 'episode' && item.show?.ids.tmdb && item.episode
              ? {
                  kind: 'episode' as const,
                  showMediaId: item.show.ids.tmdb,
                  seasonNumber: item.episode.season,
                  episodeNumber: item.episode.number,
                }
              : null;
        if (playable)
          entries.push({
            playable,
            state: 'completed',
            positionSeconds: 1,
            durationSeconds: 1,
            updatedAt: item.watched_at,
          });
      }
      if (page >= result.totalPages) return entries;
    }
  }

  async nextEpisodes(accessToken: string): Promise<PlaybackEntry[]> {
    const hidden = new Set<number>();
    for (let page = 1; ; page++) {
      const result = await this.page(
        `/users/hidden/progress_watched?type=show&page=${page}&limit=100`,
        accessToken
      );
      const rows = z
        .array(
          z.object({ show: z.object({ ids: z.object({ trakt: z.number().int().positive() }) }) })
        )
        .safeParse(result.items);
      if (!rows.success)
        throw new TraktProviderError('Trakt API returned invalid hidden shows', 502);
      rows.data.forEach(row => hidden.add(row.show.ids.trakt));
      if (page >= result.totalPages) break;
    }
    const shows = await this.request(
      '/sync/watched/shows',
      z.array(
        z.object({
          show: z.object({
            ids: z.object({
              trakt: z.number().int().positive(),
              tmdb: z.number().int().positive().nullish(),
            }),
          }),
        })
      ),
      {},
      accessToken
    );
    const entries: PlaybackEntry[] = [];
    const schema = z.object({
      last_watched_at: z.string().datetime({ offset: true }).nullable(),
      next_episode: z
        .object({
          season: z.number().int().nonnegative(),
          number: z.number().int().positive(),
          runtime: z.number().finite().positive().nullish(),
        })
        .nullable(),
    });
    for (const { show } of shows) {
      if (!show.ids.tmdb || hidden.has(show.ids.trakt)) continue;
      const progress = await this.request(
        `/shows/${show.ids.trakt}/progress/watched?hidden=false&specials=false&extended=full`,
        schema,
        {},
        accessToken
      );
      if (!progress.next_episode || !progress.last_watched_at) continue;
      entries.push({
        playable: {
          kind: 'episode',
          showMediaId: show.ids.tmdb,
          seasonNumber: progress.next_episode.season,
          episodeNumber: progress.next_episode.number,
        },
        state: 'paused',
        nextEpisode: true,
        positionSeconds: 0,
        durationSeconds: (progress.next_episode.runtime ?? 1) * 60,
        updatedAt: progress.last_watched_at,
      });
    }
    return entries;
  }

  async page<T>(
    path: string,
    accessToken?: string
  ): Promise<{ items: T[]; totalPages: number; totalItems: number }> {
    const response = await this.requestWithHeaders(path, {}, accessToken);
    const items = z.array(z.unknown()).safeParse(response.data);
    if (!items.success) throw new TraktProviderError('Trakt API returned an invalid page', 502);
    const parsePaginationHeader = (name: string, minimum: number) => {
      const value = response.headers.get(name);
      if (!value || !/^\d+$/.test(value))
        throw new TraktProviderError(`Trakt API returned an invalid ${name} header`, 502);
      const parsed = Number(value);
      if (!Number.isSafeInteger(parsed) || parsed < minimum)
        throw new TraktProviderError(`Trakt API returned an invalid ${name} header`, 502);
      return parsed;
    };
    const totalPages = parsePaginationHeader('X-Pagination-Page-Count', 0);
    const totalItems = parsePaginationHeader('X-Pagination-Item-Count', 0);
    if (totalPages === 0 && (totalItems !== 0 || items.data.length !== 0))
      throw new TraktProviderError('Trakt API returned inconsistent empty pagination', 502);
    return {
      items: items.data as T[],
      totalPages,
      totalItems,
    };
  }
}

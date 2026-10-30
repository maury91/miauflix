import { logger } from '@logger';
import { SEARCH_GENRE_KEY_PATTERN } from '@miauflix/service-contracts';
import { z } from 'zod';

const searchGenreKeySchema = z.string().regex(SEARCH_GENRE_KEY_PATTERN);

import type { SearchServerMessage } from '@routes/search.types';
import type { SearchInput, SearchService } from '@services/search/search.service';

const SEARCH_WINDOW_MS = 1_000;
const MAX_SEARCHES_PER_WINDOW = 10;

const searchMessageSchema = z
  .object({
    type: z.literal('search'),
    requestId: z.number().int().nonnegative(),
    query: z.string().trim().min(1).max(100).optional(),
    genre: searchGenreKeySchema.optional(),
    page: z.number().int().min(1).max(500),
    language: z
      .string()
      .regex(/^[a-z]{2}(-[A-Z]{2})?$/u)
      .optional(),
    commit: z.boolean().optional(),
  })
  .refine(message => (message.query === undefined) !== (message.genre === undefined));

const recentEntrySchema = z.object({
  type: z.enum(['search-recent-add', 'search-recent-remove']),
  kind: z.enum(['genre', 'query']),
  query: z.string().trim().min(1).max(100),
});

export interface SearchClient {
  userId: string;
  send(message: SearchServerMessage): void;
}

interface SearchState {
  /** Identity of the latest search; responses for any other search are dropped. */
  latestKey: string | null;
  windowStart: number;
  windowCount: number;
}

/**
 * Search over the realtime socket: results are sent as soon as the catalog answers, followed by
 * the details that need a full lookup. Typing quickly replaces the active search, so responses
 * for a superseded query never reach the client.
 */
export class RealtimeSearchChannel {
  private readonly states = new WeakMap<SearchClient, SearchState>();

  constructor(
    private readonly search: SearchService,
    private readonly now: () => number = Date.now
  ) {}

  handles(type: string): boolean {
    return (
      type === 'search' ||
      type === 'search-genres' ||
      type === 'search-recents' ||
      type === 'search-recent-add' ||
      type === 'search-recent-remove'
    );
  }

  /** Returns false when the message is malformed. */
  handle(client: SearchClient, message: Record<string, unknown>): boolean {
    if (message.type === 'search-recents') {
      void this.sendRecents(client);
      return true;
    }
    if (message.type === 'search-genres') {
      void this.sendGenres(client);
      return true;
    }
    if (message.type === 'search-recent-add' || message.type === 'search-recent-remove') {
      const parsed = recentEntrySchema.safeParse(message);
      if (!parsed.success) return false;
      const { kind, query } = parsed.data;
      if (kind === 'genre' && !searchGenreKeySchema.safeParse(query).success) return false;
      if (parsed.data.type === 'search-recent-add') {
        void this.commit(client, kind, query);
        return true;
      }
      void this.search
        .removeRecent(client.userId, kind, query)
        .then(() => this.sendRecents(client))
        .catch(error => logger.warn('RealtimeSearch', 'Failed to remove recent search', error));
      return true;
    }
    const parsed = searchMessageSchema.safeParse(message);
    if (!parsed.success) return false;
    const { requestId, query, genre, page, commit } = parsed.data;
    const language = parsed.data.language ?? 'en';
    const state = this.state(client);
    if (!this.allow(state)) {
      client.send({ type: 'search-error', requestId, message: 'rate-limited' });
      return true;
    }
    const key = genre !== undefined ? `genre:${genre}` : `query:${query!.toLocaleLowerCase()}`;
    state.latestKey = key;
    const input: SearchInput =
      genre !== undefined ? { genre, page, language } : { query: query!, page, language };
    if (commit) void this.commit(client, genre !== undefined ? 'genre' : 'query', genre ?? query!);
    void this.run(client, state, key, requestId, input);
    return true;
  }

  private async run(
    client: SearchClient,
    state: SearchState,
    key: string,
    requestId: number,
    input: SearchInput
  ): Promise<void> {
    try {
      const page = await this.search.run(input);
      if (state.latestKey !== key) return;
      client.send({ type: 'search-results', requestId, ...page });
      const items = await this.search.enrich(page.results, input.language);
      if (state.latestKey !== key) return;
      client.send({ type: 'search-details', requestId, items });
    } catch (error) {
      logger.warn('RealtimeSearch', 'Search failed', error);
      if (state.latestKey === key)
        client.send({ type: 'search-error', requestId, message: 'search-failed' });
    }
  }

  private async commit(client: SearchClient, kind: 'genre' | 'query', query: string) {
    try {
      await this.search.recordRecent(client.userId, kind, query);
      await this.sendRecents(client);
    } catch (error) {
      logger.warn('RealtimeSearch', 'Failed to record recent search', error);
    }
  }

  private async sendGenres(client: SearchClient): Promise<void> {
    try {
      client.send({ type: 'search-genres', items: await this.search.listGenres('en') });
    } catch (error) {
      logger.warn('RealtimeSearch', 'Failed to load search genres', error);
    }
  }

  private async sendRecents(client: SearchClient): Promise<void> {
    try {
      client.send({ type: 'search-recents', items: await this.search.listRecents(client.userId) });
    } catch (error) {
      logger.warn('RealtimeSearch', 'Failed to load recent searches', error);
    }
  }

  private allow(state: SearchState): boolean {
    const now = this.now();
    if (now - state.windowStart >= SEARCH_WINDOW_MS) {
      state.windowStart = now;
      state.windowCount = 0;
    }
    state.windowCount++;
    return state.windowCount <= MAX_SEARCHES_PER_WINDOW;
  }

  private state(client: SearchClient): SearchState {
    let state = this.states.get(client);
    if (!state) {
      state = { latestKey: null, windowStart: 0, windowCount: 0 };
      this.states.set(client, state);
    }
    return state;
  }
}

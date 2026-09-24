import type { Database } from 'bun:sqlite';

import { mapItems, normalizeListItems, type TraktItem } from './list-normalization';

const PUBLIC_PAGE_TTL_MS = 15 * 60 * 1000;
const PERSONAL_PAGE_TTL_MS = 2 * 60 * 1000;
const publicPaths: Record<string, string> = {
  'trakt-movies-popular': '/movies/popular?limit=50',
  'trakt-movies-trending': '/movies/trending?limit=50',
  'trakt-shows-popular': '/shows/popular?limit=50',
  'trakt-shows-trending': '/shows/trending?limit=50',
};
const personalPaths: Record<string, string> = {
  'trakt-watchlist-movies': '/sync/watchlist/movies?limit=50',
  'trakt-watchlist-shows': '/sync/watchlist/shows?limit=50',
  'trakt-favorites-movies': '/users/me/favorites/movies?limit=50',
  'trakt-favorites-shows': '/users/me/favorites/shows?limit=50',
  'trakt-history-movies': '/sync/history/movies?limit=50',
  'trakt-history-shows': '/sync/history/shows?limit=50',
};
const flights = new Map<string, Promise<unknown>>();

type Association = { connection_id: string };
type Page = {
  items: unknown[];
  totalItems: number;
  totalPages: number;
};

export const listPage = async (args: {
  database: Database;
  listId: string;
  subjectId?: string;
  page: number;
  association: (subjectId: string) => Association | null;
  accessToken: (subjectId: string, connectionId: string) => Promise<string>;
  fetchPage: <T>(path: string, token?: string) => Promise<Page>;
  seal: (value: string) => string;
  open: (value: string) => string;
}) => {
  const { database, listId, subjectId, page, association, accessToken, fetchPage, seal, open } =
    args;
  const publicPath = publicPaths[listId];
  const personalPath = personalPaths[listId];
  if (!publicPath && !personalPath) throw new Error('List not found');

  const connectionId = personalPath
    ? subjectId && association(subjectId)?.connection_id
    : undefined;
  if (personalPath && !connectionId) throw new Error('Trakt account is not connected');

  const cacheSubject = personalPath ? subjectId! : '';
  const cacheKey = `${cacheSubject}:${personalPath ? connectionId : ''}:${listId}:${page}`;
  const cached = database
    .query(
      'SELECT payload, fetched_at FROM list_pages WHERE subject_id = ?1 AND list_id = ?2 AND page = ?3'
    )
    .get(cacheSubject, listId, page) as { payload: string; fetched_at: number } | null;
  const parseCached = () => JSON.parse(open(cached!.payload));
  const ttl = personalPath ? PERSONAL_PAGE_TTL_MS : PUBLIC_PAGE_TTL_MS;
  const connectionStillCurrent = () =>
    !personalPath || association(subjectId!)?.connection_id === connectionId;

  if (cached && cached.fetched_at + ttl > Date.now()) return parseCached();
  const flight = flights.get(cacheKey);
  if (flight) {
    const result = await flight;
    if (!connectionStillCurrent()) throw new Error('Trakt account connection changed');
    return result;
  }

  const refresh = (async () => {
    try {
      const mediaType: 'movie' | 'tv' = listId.includes('shows') ? 'tv' : 'movie';
      const token = personalPath ? await accessToken(subjectId!, connectionId!) : undefined;
      const path = (publicPath ?? personalPath!).replace('limit=50', `page=${page}&limit=50`);
      const result = await fetchPage<TraktItem>(path, token);
      const bare = listId.endsWith('-popular');
      const items = mapItems(
        normalizeListItems(result.items as TraktItem[], mediaType, bare),
        mediaType
      );
      const parsed = {
        listId,
        page,
        totalPages: result.totalPages,
        totalItems: result.totalItems,
        items,
      };
      if (!connectionStillCurrent()) throw new Error('Trakt account connection changed');
      database
        .query(
          `INSERT INTO list_pages (subject_id, list_id, page, payload, fetched_at)
           VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(subject_id, list_id, page) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at`
        )
        .run(cacheSubject, listId, page, seal(JSON.stringify(parsed)), Date.now());
      return parsed;
    } catch (error) {
      if (!connectionStillCurrent()) throw new Error('Trakt account connection changed');
      if (cached) {
        console.warn(`Serving stale list page ${listId}/${page}:`, error);
        return parseCached();
      }
      throw error;
    }
  })();
  flights.set(cacheKey, refresh);
  try {
    return await refresh;
  } finally {
    flights.delete(cacheKey);
  }
};

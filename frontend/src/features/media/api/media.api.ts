import { authApi } from '@features/auth/api/auth.api';
import { mediaFromMovie, mediaFromShow } from '@features/media/lib/media-cards';
import type {
  BackdropFocusBackgroundResponse,
  BackdropFocusResponse,
  MediaBatchResponse,
  MediaDto,
  MovieResponse,
  SeasonResponse,
  ShowResponse,
} from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { type ApiRequestResult, authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

// The backend protects each media-detail route at five requests per second. Focus prefetch and
// details pages can ask for several titles at once, so keep requests for the same route below
// that ceiling while still allowing RTK Query to deduplicate identical media IDs. Rows that need
// many titles at once use getMediaCard, which batches them instead (the batch route has the same
// limit, so its requests are spaced the same way).
const MEDIA_DETAIL_INTERVAL_MS = 225;
const nextRequestAt: Record<'movie' | 'show' | 'batch', number> = { movie: 0, show: 0, batch: 0 };

async function scheduleMediaDetailRequest<T>(
  kind: 'movie' | 'show' | 'batch',
  request: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const startAt = Math.max(now, nextRequestAt[kind]);
  nextRequestAt[kind] = startAt + MEDIA_DETAIL_INTERVAL_MS;
  if (startAt > now) {
    await new Promise<void>(resolve => setTimeout(resolve, startAt - now));
  }
  return request();
}

const sessionRequest = <T>(
  requestFn: (headers: Record<string, string>) => Promise<Response>,
  getState: () => unknown,
  dispatch: (action: unknown) => unknown,
  errorContext: string
) => {
  const session = selectCurrentSessionId(getState() as RootState);
  const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
  return authenticatedRequest<T>({
    requestFn: () => requestFn(headers),
    session,
    errorContext,
    onInvalidSession: () => {
      dispatch({ type: 'auth/clearAuth' });
      dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
    },
  });
};

/** A title as the batch endpoint takes it. */
export type MediaBatchRef = { mediaType: 'movie' | 'tv'; mediaId: number };
/** The most titles one batch request carries (the backend's and catalog's batch limit). */
export const MEDIA_BATCH_LIMIT = 50;

type CardResult = ApiRequestResult<MediaDto>;
type BatchRequest = (items: MediaBatchRef[]) => Promise<ApiRequestResult<MediaBatchResponse>>;
type PendingCard = {
  ref: MediaBatchRef;
  request: BatchRequest;
  /** The title's own details request, for a server without the batch route. */
  fallback: () => Promise<CardResult>;
  resolve: (result: CardResult) => void;
};
let pendingCards: PendingCard[] = [];
/**
 * The server answered the batch route with 404: it predates it (the TV app updates apart from
 * the server). Cards then come from each title's details route, spaced under its rate limit.
 */
let batchRouteMissing = false;

const cardKey = (mediaType: 'movie' | 'tv', mediaId: number) => `${mediaType}:${mediaId}`;

/** A card that could not be loaded at all: its query settles with an error instead of waiting. */
const failedCard = (error: unknown): CardResult => ({
  error: { status: 500, data: error instanceof Error ? error.message : 'Failed to fetch titles' },
});

/** Resolve each card from its own details route; one that throws settles with an error. */
const loadFallbacks = (chunk: PendingCard[]) => {
  for (const { fallback, resolve } of chunk)
    void fallback().then(resolve, error => resolve(failedCard(error)));
};

/** Send the cards asked for since the last flush, at most MEDIA_BATCH_LIMIT per request. */
function flushMediaCards() {
  const pending = pendingCards;
  pendingCards = [];
  for (let start = 0; start < pending.length; start += MEDIA_BATCH_LIMIT) {
    const chunk = pending.slice(start, start + MEDIA_BATCH_LIMIT);
    if (batchRouteMissing) {
      loadFallbacks(chunk);
      continue;
    }
    const refs = chunk.map(({ ref }) => ref);
    // A rejected request or an unexpected body settles every card with an error: a card left
    // pending would keep its query loading forever
    void scheduleMediaDetailRequest('batch', () => chunk[0].request(refs))
      .then(result => {
        if ('error' in result && result.error.status === 404) {
          batchRouteMissing = true;
          loadFallbacks(chunk);
          return;
        }
        const cards = new Map(
          'data' in result
            ? result.data.results.map(card => [
                cardKey(card._type === 'movie' ? 'movie' : 'tv', card.mediaId),
                card,
              ])
            : []
        );
        for (const { ref, resolve } of chunk) {
          const card = cards.get(cardKey(ref.mediaType, ref.mediaId));
          if (card) resolve({ data: card });
          else if ('error' in result) resolve(result);
          else resolve({ error: { status: 404, data: 'Title not found' } });
        }
      })
      .catch(error => {
        // A card resolved already keeps its result: a promise settles once
        for (const { resolve } of chunk) resolve(failedCard(error));
      });
  }
}

/**
 * Queue a card for the next batch request. The cards asked for in the same task (one render's
 * subscriptions) share a request.
 */
function loadMediaCard(
  ref: MediaBatchRef,
  request: BatchRequest,
  fallback: () => Promise<CardResult>
): Promise<CardResult> {
  if (batchRouteMissing) return fallback();
  return new Promise(resolve => {
    if (pendingCards.length === 0) setTimeout(flushMediaCards, 0);
    pendingCards.push({ ref, request, fallback, resolve });
  });
}

/** Test only: forget that the server lacked the batch route. */
export function resetMediaBatchSupport() {
  batchRouteMissing = false;
}

/** A card from the title's own details route (spaced like getMovie and getShow). */
async function titleCard(
  { mediaType, mediaId }: MediaBatchRef,
  getState: () => unknown,
  dispatch: (action: unknown) => unknown
): Promise<CardResult> {
  const query = { param: { id: String(mediaId) }, query: { lang: 'en' } };
  if (mediaType === 'movie') {
    const result = await scheduleMediaDetailRequest('movie', () =>
      sessionRequest<MovieResponse>(
        headers => backendClient.api.movies[':id'].$get(query, { headers }),
        getState,
        dispatch,
        'Failed to fetch movie details'
      )
    );
    return 'data' in result ? { data: mediaFromMovie(result.data) } : result;
  }
  const result = await scheduleMediaDetailRequest('show', () =>
    sessionRequest<ShowResponse>(
      headers => backendClient.api.shows[':id'].$get(query, { headers }),
      getState,
      dispatch,
      'Failed to fetch show details'
    )
  );
  return 'data' in result ? { data: mediaFromShow(result.data) } : result;
}

export const mediaApi = createApi({
  reducerPath: 'mediaApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  tagTypes: ['Movie', 'Season'],
  endpoints: builder => ({
    getMovie: builder.query<MovieResponse, number>({
      providesTags: (_result, _error, mediaId) => [{ type: 'Movie', id: mediaId }],
      async queryFn(mediaId, api) {
        return {
          ...(await scheduleMediaDetailRequest('movie', () =>
            sessionRequest<MovieResponse>(
              headers =>
                backendClient.api.movies[':id'].$get(
                  { param: { id: String(mediaId) }, query: { lang: 'en' } },
                  { headers }
                ),
              api.getState,
              api.dispatch,
              'Failed to fetch movie details'
            )
          )),
        };
      },
    }),
    getShow: builder.query<ShowResponse, number>({
      async queryFn(mediaId, api) {
        return {
          ...(await scheduleMediaDetailRequest('show', () =>
            sessionRequest<ShowResponse>(
              headers =>
                backendClient.api.shows[':id'].$get(
                  { param: { id: String(mediaId) }, query: { lang: 'en' } },
                  { headers }
                ),
              api.getState,
              api.dispatch,
              'Failed to fetch show details'
            )
          )),
        };
      },
    }),
    /**
     * One title's card, for rows not built from a list (Continue watching). Each title keeps
     * its own cache entry, but the requests made together go out as one batch request: a
     * details request per title would run into the backend's per-address limit.
     */
    getMediaCard: builder.query<MediaDto, MediaBatchRef>({
      queryFn: (ref, api) =>
        loadMediaCard(
          ref,
          items =>
            sessionRequest<MediaBatchResponse>(
              headers =>
                backendClient.api.media.batch.$post({ json: { items, lang: 'en' } }, { headers }),
              api.getState,
              api.dispatch,
              'Failed to fetch titles'
            ),
          () => titleCard(ref, api.getState, api.dispatch)
        ),
    }),
    getSeason: builder.query<SeasonResponse, { showId: number; season: number }>({
      providesTags: (_result, _error, { showId, season }) => [
        { type: 'Season', id: `${showId}:${season}` },
      ],
      async queryFn({ showId, season }, api) {
        return {
          ...(await sessionRequest<SeasonResponse>(
            headers =>
              backendClient.api.shows[':id'].seasons[':season'].$get(
                {
                  param: { id: String(showId), season: String(season) },
                },
                { headers }
              ),
            api.getState,
            api.dispatch,
            'Failed to fetch season details'
          )),
        };
      },
    }),
    ensureBackdropFocus: builder.mutation<
      BackdropFocusResponse,
      { mediaType: 'movie' | 'tv'; mediaId: number }
    >({
      /** Requests backdrop focus for a catalog media ID, returning request failures as RTK Query errors. */
      async queryFn({ mediaType, mediaId }, api) {
        return {
          ...(await sessionRequest<BackdropFocusResponse>(
            headers =>
              backendClient.api.media[':mediaType'][':mediaId']['backdrop-focus'].$post(
                { param: { mediaType, mediaId: String(mediaId) } },
                { headers }
              ),
            api.getState,
            api.dispatch,
            'Failed to analyze backdrop focus'
          )),
        };
      },
    }),
    queueBackdropFocus: builder.mutation<
      BackdropFocusBackgroundResponse,
      { items: Array<{ mediaType: 'movie' | 'tv'; mediaId: number }> }
    >({
      /** Enqueues displayed-list backdrop work without waiting for model analysis. */
      async queryFn({ items }, api) {
        return {
          ...(await sessionRequest<BackdropFocusBackgroundResponse>(
            headers =>
              backendClient.api.media['backdrop-focus'].background.$post(
                { json: { items } },
                { headers }
              ),
            api.getState,
            api.dispatch,
            'Failed to queue backdrop focus preparation'
          )),
        };
      },
    }),
  }),
});

export const {
  useGetMovieQuery,
  useGetShowQuery,
  useGetSeasonQuery,
  useLazyGetSeasonQuery,
  useEnsureBackdropFocusMutation,
  useQueueBackdropFocusMutation,
} = mediaApi;

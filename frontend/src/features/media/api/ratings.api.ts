import { authApi } from '@features/auth/api/auth.api';
import type { MediaRatingRef, MediaRatingResponse } from '@miauflix/backend';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

import { listsApi } from './lists.api';

// The account is part of the cache key, never a client-controlled server identity.
type RatingQuery = MediaRatingRef & { userId: string };
const ratingTag = (item: RatingQuery) => ({
  type: 'Rating' as const,
  id: `${item.userId}:${item.mediaType}:${item.mediaId}`,
});

export const ratingsApi = listsApi.injectEndpoints({
  endpoints: builder => ({
    getMediaRating: builder.query<MediaRatingResponse, RatingQuery>({
      async queryFn({ mediaType, mediaId }, { getState, dispatch }) {
        const session = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<MediaRatingResponse>({
          requestFn: () =>
            backendClient.api.ratings.$get(
              { query: { mediaType, mediaId: String(mediaId) } },
              { headers }
            ),
          session,
          errorContext: 'Failed to load your rating',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
      providesTags: (_result, _error, item) => [ratingTag(item)],
    }),
    setMediaRating: builder.mutation<
      MediaRatingResponse,
      RatingQuery & Pick<MediaRatingResponse, 'rating'>
    >({
      async queryFn({ userId: _userId, ...item }, { getState, dispatch }) {
        const session = selectCurrentSessionId(getState() as RootState);
        const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
        return authenticatedRequest<MediaRatingResponse>({
          requestFn: () => backendClient.api.ratings.$put({ json: item }, { headers }),
          session,
          errorContext: 'Failed to save your rating',
          onInvalidSession: () => {
            dispatch({ type: 'auth/clearAuth' });
            dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
          },
        });
      },
      invalidatesTags: (result, _error, item) => (result ? [ratingTag(item)] : []),
    }),
  }),
});

export const { useGetMediaRatingQuery, useSetMediaRatingMutation } = ratingsApi;

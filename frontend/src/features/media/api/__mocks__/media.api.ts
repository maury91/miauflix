import type { SeasonResponse } from '@miauflix/backend';
import { fn } from 'storybook/test';

const emptySelector = () => () => ({ data: undefined });

export const mediaApi = {
  util: {
    prefetch: fn(),
  },
  endpoints: {
    getMovie: { select: emptySelector, initiate: fn() },
    getShow: { select: emptySelector, initiate: fn() },
  },
};

const emptyQuery = {
  data: undefined,
  currentData: undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
};

export const useGetMovieQuery = fn().mockReturnValue(emptyQuery);
export const useGetShowQuery = fn().mockReturnValue(emptyQuery);
export const useGetSeasonQuery = fn().mockReturnValue(emptyQuery);
export const useLazyGetSeasonQuery = () =>
  [
    ({ season }: { showId: number; season: number }) => ({
      unwrap: async (): Promise<SeasonResponse> => ({
        id: 1,
        seasonNumber: season,
        name: `Season ${season}`,
        overview: null,
        airDate: null,
        poster: null,
        episodes: [
          {
            id: 1,
            episodeNumber: 1,
            title: 'Episode 1',
            overview: null,
            airDate: null,
            still: null,
          },
        ],
      }),
    }),
  ] as const;
export const useEnsureBackdropFocusMutation = () =>
  [
    () => ({
      unwrap: async () => ({ backdropFocus: { x: 0.5, y: 0.5 } }),
    }),
  ] as const;
export const useQueueBackdropFocusMutation = () =>
  [
    (request: { items: Array<{ mediaType: 'movie' | 'tv'; mediaId: number }> }) => ({
      unwrap: async () => ({ accepted: request.items.length }),
    }),
  ] as const;

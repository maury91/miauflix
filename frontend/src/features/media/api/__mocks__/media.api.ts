import { fn } from 'storybook/test';

export const mediaApi = {
  util: {
    prefetch: fn(),
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
export const useEnsureBackdropFocusMutation = () =>
  [
    () => ({
      unwrap: async () => ({ backdropFocus: null }),
    }),
  ] as const;

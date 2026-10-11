import { fn } from 'storybook/test';
export const useGetMediaRatingQuery = () => ({
  data: { rating: null },
  currentData: { rating: null },
  isLoading: false,
  isFetching: false,
  isError: false,
  refetch: fn(),
});
export const useSetMediaRatingMutation = () => [fn(), { isLoading: false }] as const;

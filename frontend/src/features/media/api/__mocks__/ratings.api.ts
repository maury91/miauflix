import { fn } from 'storybook/test';
export const useGetMediaRatingQuery = () => ({ data: undefined, isLoading: false });
export const useSetMediaRatingMutation = () => [fn(), { isLoading: false }] as const;

import { fn } from 'storybook/test';
export const progressApi = {
  endpoints: { getProgress: { select: () => () => ({ data: undefined }) } },
  util: {
    resetApiState: () => ({ type: 'storybook/progress/reset' }),
    invalidateTags: () => ({ type: 'storybook/progress/invalidate' }),
  },
};
export const useGetProgressQuery = () => ({ data: undefined });
export const useUpdateProgressMutation = () => [fn(), { isLoading: false }] as const;
export const progressForPlayable = () => undefined;
export const applyProgressUpdate = fn();

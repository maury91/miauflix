import { fn } from 'storybook/test';

const emptyProgressState = { data: undefined, status: 'uninitialized' };

export const progressApi = {
  endpoints: {
    getProgress: {
      select: () => () => emptyProgressState,
      initiate: fn().mockReturnValue({ unsubscribe: fn() }),
    },
  },
  util: {
    resetApiState: () => ({ type: 'storybook/progress/reset' }),
    invalidateTags: () => ({ type: 'storybook/progress/invalidate' }),
  },
};
export const useGetProgressQuery = () => ({ data: undefined });
export const useUpdateProgressMutation = () => [fn(), { isLoading: false }] as const;
export const progressForPlayable = () => undefined;
export const applyProgressUpdate = fn();

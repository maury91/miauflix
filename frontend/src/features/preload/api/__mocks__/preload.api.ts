import { fn } from 'storybook/test';

// Realtime middleware imports the API utility for cache resets. Stories do not
// install the API reducer or middleware, so only expose the utility it needs.
export const preloadApi = {
  util: {
    resetApiState: fn().mockName('preloadApi.util.resetApiState'),
  },
};

export const useUpdateIntentMutation = () => [fn(), { isLoading: false }] as const;
export const useRemoveIntentMutation = () => [fn(), { isLoading: false }] as const;

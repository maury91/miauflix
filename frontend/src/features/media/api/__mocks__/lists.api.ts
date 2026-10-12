import { fn } from 'storybook/test';

// Keep the Storybook mock explicit so transitive consumers can import every
// generated RTK Query hook, including hooks added after the original stories.
export const useGetListsQuery = fn().mockName('useGetListsQuery');
export const useGetListQuery = fn().mockName('useGetListQuery');
export const useGetPopularListsInfiniteQuery = fn().mockName('useGetPopularListsInfiniteQuery');
export const usePromoteListMediaMutation = fn().mockName('usePromoteListMediaMutation');
export const useGetWatchlistMembershipQuery = fn().mockName('useGetWatchlistMembershipQuery');
export const useAddToWatchlistMutation = fn().mockName('useAddToWatchlistMutation');
export const useRemoveFromWatchlistMutation = fn().mockName('useRemoveFromWatchlistMutation');
export const usePrefetch = fn().mockName('usePrefetch');

// Non-hook consumers import listsApi for utility actions (for example, realtime
// cache resets). Stories do not install its reducer or middleware, so expose
// only the utility surface needed to keep those imports loadable.
export const listsApi = {
  util: {
    resetApiState: fn().mockName('listsApi.util.resetApiState'),
  },
};

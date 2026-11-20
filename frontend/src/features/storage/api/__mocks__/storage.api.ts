import { fn } from 'storybook/test';

// Settings stories replace these hooks with story-local data (`mocked(...)` in `beforeEach`).
export const storageApi = {
  util: { resetApiState: fn().mockName('storageApi.util.resetApiState') },
};

export const useGetStorageInventoryQuery = fn().mockReturnValue({
  data: undefined,
  isLoading: true,
  isFetching: true,
  refetch: fn(),
});
export const useRemoveStorageMutation = fn().mockReturnValue([fn(), { isLoading: false }]);

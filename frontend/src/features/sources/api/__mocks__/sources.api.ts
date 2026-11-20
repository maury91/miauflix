import { fn } from 'storybook/test';

// Settings stories replace these hooks with story-local data (`mocked(...)` in `beforeEach`).
export const sourcesApi = {
  util: { resetApiState: fn().mockName('sourcesApi.util.resetApiState') },
};

const mutation = () => fn().mockReturnValue([fn(), { isLoading: false }]);
const query = (data: unknown) =>
  fn().mockReturnValue({ data, isLoading: false, error: undefined, refetch: fn() });

export const useGetProvidersQuery = query([]);
export const useGetRepositoriesQuery = query([]);
export const useUpdateProviderMutation = mutation();
export const useReorderProvidersMutation = mutation();
export const useTestProviderMutation = mutation();
export const useLoadDefinitionsMutation = mutation();
export const useSyncDefinitionsMutation = mutation();
export const useAddCardigannProviderMutation = mutation();
export const useAddTorznabProviderMutation = mutation();
export const useRemoveProviderMutation = mutation();
export const useAddRepositoryMutation = mutation();
export const useRefreshRepositoryMutation = mutation();
export const useRemoveRepositoryMutation = mutation();

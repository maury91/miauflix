import { fn } from 'storybook/test';

// Settings stories replace these hooks with story-local data (`mocked(...)` in `beforeEach`).
export const configApi = {
  util: { resetApiState: fn().mockName('configApi.util.resetApiState') },
};

export const useGetConfigQuery = fn().mockReturnValue({ data: [], isLoading: false });
export const useGetServiceStatusesQuery = fn().mockReturnValue({ data: {}, isLoading: false });
export const useUpdateConfigMutation = fn().mockReturnValue([fn(), { isLoading: false }]);
export const useTestServiceConfigMutation = fn().mockReturnValue([fn(), { isLoading: false }]);
export const useSaveServiceConfigMutation = fn().mockReturnValue([fn(), { isLoading: false }]);
export const useRestartServiceMutation = fn().mockReturnValue([fn(), { isLoading: false }]);

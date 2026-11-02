export type { ProviderSetting, ProviderView, RepositoryView } from '@miauflix/service-contracts';

export type UpdateProviderRequest = {
  enabled?: boolean;
  priority?: number;
  settings?: Record<string, boolean | string>;
};
export type ReorderProvidersRequest = { ids: string[] };
export type AddRepositoryRequest = { url: string };
export type TestProviderResponse = { success: boolean; message: string };

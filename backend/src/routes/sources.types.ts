export type {
  CardigannCatalog,
  CardigannCatalogQuery,
  CardigannDefinitionEntry,
  CardigannSyncStatus,
  ProviderSetting,
  ProviderView,
  RepositoryView,
} from '@miauflix/service-contracts';

export type UpdateProviderRequest = {
  enabled?: boolean;
  priority?: number;
  settings?: Record<string, boolean | string>;
};
export type ReorderProvidersRequest = { ids: string[] };
export type AddRepositoryRequest = { url: string };
export type TestProviderResponse = { success: boolean; message: string };
export type AddCardigannProviderRequest = { id: string };
export type AddTorznabProviderRequest = { name: string; baseUrl: string; apiKey?: string };

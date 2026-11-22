import { authApi } from '@features/auth/api/auth.api';
import type {
  AddRepositoryRequest,
  AddTorznabProviderRequest,
  CardigannCatalog,
  CardigannSyncStatus,
  ProviderView,
  RepositoryView,
  TestProviderResponse,
  UpdateProviderRequest,
} from '@miauflix/backend';
import { createApi } from '@reduxjs/toolkit/query/react';
import { authenticatedRequest } from '@shared/api/authenticated-request';
import { backendClient } from '@shared/api/backend-client';
import { t } from '@shared/i18n';
import { selectCurrentSessionId } from '@store/slices/auth';
import type { RootState } from '@store/store';

type ThunkApi = {
  getState: () => unknown;
  dispatch: (action: unknown) => unknown;
};

/** Runs one authenticated admin request, resetting the session when it is no longer valid. */
function adminRequest<T>(
  api: ThunkApi,
  errorContext: string,
  requestFn: (headers: Record<string, string>) => Promise<Response>
) {
  const session = selectCurrentSessionId(api.getState() as RootState);
  const headers: Record<string, string> = session ? { 'X-Session-Id': session } : {};
  return authenticatedRequest<T>({
    requestFn: () => requestFn(headers),
    session,
    errorContext,
    onInvalidSession: () => {
      api.dispatch({ type: 'auth/clearAuth' });
      api.dispatch(authApi.endpoints.listSessions.initiate(undefined, { forceRefetch: true }));
    },
  });
}

export interface CatalogArgs {
  query?: string;
  source?: string;
  imdb?: boolean;
  tmdb?: boolean;
  tvdb?: boolean;
  movies?: boolean;
  tv?: boolean;
  anime?: boolean;
  publicOnly?: boolean;
  supportedOnly?: boolean;
  offset: number;
  limit: number;
}

/** The backend reads filters from the query string; only the ones that are set are sent. */
function catalogQuery(args: CatalogArgs): Record<string, string> {
  const query: Record<string, string> = { offset: String(args.offset), limit: String(args.limit) };
  if (args.query?.trim()) query['query'] = args.query.trim();
  if (args.source) query['source'] = args.source;
  for (const flag of [
    'imdb',
    'tmdb',
    'tvdb',
    'movies',
    'tv',
    'anime',
    'publicOnly',
    'supportedOnly',
  ] as const)
    if (args[flag]) query[flag] = 'true';
  return query;
}

export const sourcesApi = createApi({
  reducerPath: 'sourcesApi',
  baseQuery: async () => ({ error: { status: 501, data: 'Not implemented' } }),
  tagTypes: ['Providers', 'Repositories', 'Definitions'],
  endpoints: builder => ({
    getProviders: builder.query<ProviderView[], void>({
      providesTags: ['Providers'],
      queryFn: (_arg, api) =>
        adminRequest<ProviderView[]>(api, t('api.failedToLoadProviders'), headers =>
          backendClient.api.sources.providers.$get({}, { headers })
        ),
    }),
    updateProvider: builder.mutation<ProviderView, { id: string } & UpdateProviderRequest>({
      invalidatesTags: ['Providers'],
      queryFn: ({ id, ...json }, api) =>
        adminRequest<ProviderView>(api, t('api.failedToUpdateProvider'), headers =>
          backendClient.api.sources.providers[':id'].$patch({ param: { id }, json }, { headers })
        ),
    }),
    reorderProviders: builder.mutation<ProviderView[], string[]>({
      invalidatesTags: ['Providers'],
      queryFn: (ids, api) =>
        adminRequest<ProviderView[]>(api, t('api.failedToReorderProviders'), headers =>
          backendClient.api.sources.providers.order.$put({ json: { ids } }, { headers })
        ),
    }),
    testProvider: builder.mutation<TestProviderResponse, string>({
      queryFn: (id, api) =>
        adminRequest<TestProviderResponse>(api, t('api.testProviderFailed'), headers =>
          backendClient.api.sources.providers[':id'].test.$post({ param: { id } }, { headers })
        ),
    }),
    /** One page of the synced Jackett list. A mutation so pages are never cached or shared. */
    loadDefinitions: builder.mutation<CardigannCatalog, CatalogArgs>({
      queryFn: (args, api) =>
        adminRequest<CardigannCatalog>(api, t('api.failedToLoadTheIndexerList'), headers =>
          backendClient.api.sources.definitions.$get({ query: catalogQuery(args) }, { headers })
        ),
    }),
    syncDefinitions: builder.mutation<CardigannSyncStatus, void>({
      queryFn: (_arg, api) =>
        adminRequest<CardigannSyncStatus>(api, t('api.failedToUpdateTheIndexerList'), headers =>
          backendClient.api.sources.definitions.sync.$post({}, { headers })
        ),
    }),
    addCardigannProvider: builder.mutation<ProviderView, { id: string; source?: string }>({
      invalidatesTags: ['Providers', 'Repositories', 'Definitions'],
      queryFn: (json, api) =>
        adminRequest<ProviderView>(api, t('api.failedToAddTheIndexer'), headers =>
          backendClient.api.sources.providers.cardigann.$post({ json }, { headers })
        ),
    }),
    addTorznabProvider: builder.mutation<ProviderView, AddTorznabProviderRequest>({
      invalidatesTags: ['Providers', 'Repositories'],
      queryFn: (json, api) =>
        adminRequest<ProviderView>(api, t('api.failedToAddTheEndpoint'), headers =>
          backendClient.api.sources.providers.torznab.$post({ json }, { headers })
        ),
    }),
    removeProvider: builder.mutation<void, string>({
      invalidatesTags: ['Providers', 'Repositories', 'Definitions'],
      queryFn: (id, api) =>
        adminRequest<void>(api, t('api.failedToRemoveTheProvider'), headers =>
          backendClient.api.sources.providers[':id'].$delete({ param: { id } }, { headers })
        ),
    }),
    getRepositories: builder.query<RepositoryView[], void>({
      providesTags: ['Repositories'],
      queryFn: (_arg, api) =>
        adminRequest<RepositoryView[]>(api, t('api.failedToLoadRepositories'), headers =>
          backendClient.api.sources.repositories.$get({}, { headers })
        ),
    }),
    addRepository: builder.mutation<RepositoryView, AddRepositoryRequest>({
      invalidatesTags: ['Providers', 'Repositories'],
      queryFn: (json, api) =>
        adminRequest<RepositoryView>(api, t('api.failedToAddRepository'), headers =>
          backendClient.api.sources.repositories.$post({ json }, { headers })
        ),
    }),
    refreshRepository: builder.mutation<RepositoryView, string>({
      invalidatesTags: ['Providers', 'Repositories'],
      queryFn: (id, api) =>
        adminRequest<RepositoryView>(api, t('api.failedToRefreshRepository'), headers =>
          backendClient.api.sources.repositories[':id'].refresh.$post(
            { param: { id } },
            { headers }
          )
        ),
    }),
    removeRepository: builder.mutation<void, string>({
      invalidatesTags: ['Providers', 'Repositories'],
      queryFn: (id, api) =>
        adminRequest<void>(api, t('api.failedToRemoveRepository'), headers =>
          backendClient.api.sources.repositories[':id'].$delete({ param: { id } }, { headers })
        ),
    }),
  }),
});

export const {
  useGetProvidersQuery,
  useUpdateProviderMutation,
  useReorderProvidersMutation,
  useTestProviderMutation,
  useLoadDefinitionsMutation,
  useSyncDefinitionsMutation,
  useAddCardigannProviderMutation,
  useAddTorznabProviderMutation,
  useRemoveProviderMutation,
  useGetRepositoriesQuery,
  useAddRepositoryMutation,
  useRefreshRepositoryMutation,
  useRemoveRepositoryMutation,
} = sourcesApi;

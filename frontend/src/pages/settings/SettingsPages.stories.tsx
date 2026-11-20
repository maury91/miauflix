import * as sourcesApi from '@features/sources/api/sources.api';
import {
  useGetProvidersQuery,
  useGetRepositoriesQuery,
  useLoadDefinitionsMutation,
} from '@features/sources/api/sources.api';
import {
  useGetStorageInventoryQuery,
  useRemoveStorageMutation,
} from '@features/storage/api/storage.api';
import type { ProviderView, StorageItemView } from '@miauflix/backend';
import { storyImage } from '@shared/design-system/storyImage';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, mocked } from 'storybook/test';

import SourcesPage from './SourcesPage';
import StoragePage from './StoragePage';

const GiB = 1024 ** 3;

const provider = (
  id: string,
  name: string,
  priority: number,
  overrides: Partial<ProviderView> = {}
) =>
  ({
    id,
    name,
    description: null,
    kind: 'cardigann',
    repositoryId: 'builtin:miauflix',
    version: null,
    enabled: true,
    priority,
    caps: { movie: [], tv: [], anime: [] },
    requiresFlareSolverr: false,
    settingsSchema: [{ name: 'dailyBudget', type: 'text', label: 'Daily request budget' }],
    settings: {},
    health: { state: 'ok', cooldownUntil: null, lastError: null, lastSuccessAt: null },
    usage: { today: 12, dailyBudget: 2000, perMinute: 60 },
    ...overrides,
  }) as unknown as ProviderView;

const PROVIDERS = [
  provider('yts', 'YTS', 10, { description: 'Movies in small sizes' }),
  provider('eztv', 'EZTV', 20, {
    health: {
      state: 'cooldown',
      cooldownUntil: '2026-11-20T18:00:00Z',
      lastError: 'Rate limited (429)',
      lastSuccessAt: null,
    },
  } as Partial<ProviderView>),
  provider('my-jackett', 'My Jackett', 30, {
    kind: 'torznab',
    repositoryId: 'local:user',
    enabled: false,
    requiresFlareSolverr: true,
  } as Partial<ProviderView>),
];

const REPOSITORIES = [
  {
    id: 'builtin:miauflix',
    url: 'builtin:miauflix',
    name: 'Miauflix',
    builtIn: true,
    lastFetchedAt: null,
    lastError: null,
    providerCount: 2,
  },
  {
    id: 'repo:1',
    url: 'https://repo.example/list.json',
    name: 'repo.example',
    builtIn: false,
    lastFetchedAt: '2026-11-01T10:00:00Z',
    lastError: null,
    providerCount: 1,
  },
];

const storageItem = (overrides: Partial<StorageItemView>) =>
  ({
    sourceId: 1,
    kind: 'movie',
    title: 'Example Film',
    subtitle: '2024',
    image: storyImage('#7a2a1e', '#e0a050'),
    remuxBytes: 0,
    fileName: 'Example.Film.2024.1080p.mkv',
    quality: '1080p',
    physicalBytes: 2.4 * GiB,
    reservedBytes: 2.6 * GiB,
    progressPercent: 100,
    videoComplete: true,
    activity: 'local_only',
    torrentLoaded: false,
    activeStreams: 0,
    seedEndsAt: null,
    ...overrides,
  }) as StorageItemView;

/** Storybook resets module mocks before each story: every mutation gets its value again. */
function mockSourceMutations() {
  const mutations = [
    sourcesApi.useUpdateProviderMutation,
    sourcesApi.useReorderProvidersMutation,
    sourcesApi.useTestProviderMutation,
    sourcesApi.useSyncDefinitionsMutation,
    sourcesApi.useAddCardigannProviderMutation,
    sourcesApi.useAddTorznabProviderMutation,
    sourcesApi.useRemoveProviderMutation,
    sourcesApi.useAddRepositoryMutation,
    sourcesApi.useRefreshRepositoryMutation,
    sourcesApi.useRemoveRepositoryMutation,
  ];
  for (const hook of mutations) mocked(hook).mockReturnValue([fn(), { isLoading: false }] as never);
}

const meta = {
  title: 'Settings/Service settings',
  component: SourcesPage,
  args: { onDismiss: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SourcesPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The sources in search order: a switch, Test and options each; Advanced setup collapsed. */
export const Sources: Story = {
  beforeEach: () => {
    mockSourceMutations();
    mocked(useGetProvidersQuery).mockReturnValue({
      data: PROVIDERS,
      isLoading: false,
      refetch: fn(),
    } as never);
    mocked(useGetRepositoriesQuery).mockReturnValue({ data: REPOSITORIES } as never);
    mocked(useLoadDefinitionsMutation).mockReturnValue([
      fn(() => ({
        unwrap: () =>
          Promise.resolve({
            entries: [],
            total: 0,
            sync: {
              lastSyncAt: null,
              syncing: false,
              total: 0,
              ready: 0,
              failed: 0,
              intervalMinutes: 60,
              sources: [],
            },
          }),
      })),
    ] as never);
  },
};

/** Downloads using disk space, with what each one is doing and Free space. */
export const Storage: Story = {
  beforeEach: () => {
    mocked(useRemoveStorageMutation).mockReturnValue([fn(), { isLoading: false }] as never);
    mocked(useGetStorageInventoryQuery).mockReturnValue({
      data: {
        summary: {
          physicalBytes: 18.3 * GiB,
          storageBudgetBytes: 50 * GiB,
          reservedBytes: 20.1 * GiB,
          chargedBytes: 21 * GiB,
          filesystem: { totalBytes: 120 * GiB, freeBytes: 52 * GiB },
        },
        items: [
          storageItem({
            physicalBytes: 10.1 * GiB,
            reservedBytes: 10.1 * GiB,
            activity: 'inactive',
          }),
          storageItem({
            sourceId: 2,
            title: 'Coyote Canyon',
            image: storyImage('#b8482a', '#2a1a40'),
            physicalBytes: 5.3 * GiB,
            reservedBytes: 5.3 * GiB,
            remuxBytes: 1.4 * GiB,
            activity: 'available_offline',
            torrentLoaded: true,
            seedEndsAt: '2026-11-21T18:00:00Z',
          }),
          storageItem({
            sourceId: 3,
            kind: 'episode',
            title: 'A Show',
            subtitle: 'S01E02 · The Second One',
            image: storyImage('#1e4a7a', '#50c0e0'),
            fileName: 'A.Show.S01E02.720p.mkv',
            quality: '720p',
            physicalBytes: 1.9 * GiB,
            reservedBytes: 3.7 * GiB,
            progressPercent: 51,
            videoComplete: false,
            activity: 'active',
            torrentLoaded: true,
            activeStreams: 1,
          }),
          storageItem({
            sourceId: 4,
            kind: 'anime',
            title: 'An Anime',
            subtitle: 'Season 1 · 12 episodes',
            image: null,
            fileName: null,
            quality: '1080p',
            physicalBytes: 999 * 1024 ** 2,
            reservedBytes: 999 * 1024 ** 2,
            activity: 'local_only',
          }),
        ],
      },
      isLoading: false,
      isFetching: false,
      refetch: fn(),
    } as never);
  },
  render: args => <StoragePage {...args} />,
};

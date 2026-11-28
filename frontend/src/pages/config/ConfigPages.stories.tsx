import {
  useGetConfigQuery,
  useGetServiceStatusesQuery,
  useSaveServiceConfigMutation,
  useTestServiceConfigMutation,
  useUpdateConfigMutation,
} from '@features/config/api/config.api';
import {
  useAddCardigannProviderMutation,
  useAddStremioProviderMutation,
  useAddTorznabProviderMutation,
  useGetProvidersQuery,
  useLoadDefinitionsMutation,
  useSyncDefinitionsMutation,
  useUpdateProviderMutation,
} from '@features/sources/api/sources.api';
import type { ConfigEntryView, ProviderView } from '@miauwatch/backend';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, mocked, waitFor } from 'storybook/test';

import ConfigurationWizardPage from './ConfigurationWizardPage';
import ConfigWizardPage from './ConfigWizardPage';
import SourcesSetupPage from './SourcesSetupPage';

import { mutationTrigger, mutationTriggerFrom } from '@/__test-utils__/mutationTrigger';

const entry = (overrides: Partial<ConfigEntryView> & Pick<ConfigEntryView, 'key'>) =>
  ({
    value: '',
    isSecret: false,
    serviceGroup: 'CATALOG',
    serviceDescription: 'Movie and show metadata from The Movie Database.',
    description: 'A setting.',
    required: false,
    hasValue: true,
    inputType: 'text',
    ...overrides,
  }) satisfies ConfigEntryView;

const ENTRIES: ConfigEntryView[] = [
  entry({
    key: 'TMDB_API_ACCESS_TOKEN',
    label: 'TMDB API access token',
    isSecret: true,
    required: true,
    hasValue: false,
    description: 'Create an API read access token in your TMDB account, then paste it here.',
    link: 'https://www.themoviedb.org/settings/api',
    linkLabel: 'Open TMDB API settings',
    testRelevant: true,
  }),
  entry({
    key: 'TMDB_API_URL',
    value: 'https://api.themoviedb.org/3',
    example: 'https://api.themoviedb.org/3',
  }),
  entry({ key: 'TMDB_LANGUAGE', value: 'en-US', description: 'Language of titles and overviews.' }),
  entry({
    key: 'EPISODE_SYNC_MODE',
    serviceGroup: 'CATALOG_RUNTIME',
    serviceDescription: 'Episode syncing and catalog freshness behavior.',
    inputType: 'select',
    value: 'ON_DEMAND',
    options: { GREEDY: 'sync every TV show', ON_DEMAND: 'sync watched TV shows' },
    description: 'Which shows keep their episodes in sync.',
  }),
  entry({
    key: 'CATALOG_REFRESH_INTERVAL',
    serviceGroup: 'CATALOG_RUNTIME',
    serviceDescription: 'Episode syncing and catalog freshness behavior.',
    inputType: 'time',
    timeUnits: ['m', 'h', 'd'],
    value: '12h',
    description: 'How often the catalog is refreshed.',
  }),
  entry({
    key: 'DISABLE_DISCOVERY',
    serviceGroup: 'MEDIA_LOAD',
    serviceDescription: 'Torrent engine service: downloads, storage limits and tracker scrapes.',
    inputType: 'boolean',
    value: 'false',
    booleanStateDescriptions: { true: 'DHT discovery paused', false: 'DHT discovery active' },
    description: 'Peer discovery through the DHT.',
  }),
  entry({
    key: 'STORAGE_BUDGET',
    serviceGroup: 'MEDIA_LOAD',
    serviceDescription: 'Torrent engine service: downloads, storage limits and tracker scrapes.',
    inputType: 'size',
    sizeUnits: ['MB', 'GB', 'TB'],
    value: '200GB',
    description: 'Disk space downloads may use.',
  }),
  entry({
    key: 'MAX_CONNECTIONS',
    serviceGroup: 'MEDIA_LOAD',
    serviceDescription: 'Torrent engine service: downloads, storage limits and tracker scrapes.',
    inputType: 'number',
    numberOptions: { min: 1, max: 500, integer: true },
    value: '55',
    description: 'Peer connections per download.',
    advanced: true,
    warning: 'High values can saturate home routers.',
  }),
];

const source = (id: string, name: string, priority: number, description: string | null = null) =>
  ({ id, name, priority, description, kind: 'cardigann', enabled: false }) as ProviderView;

/** Sources the admin added, switched off until they turn them on. */
const SOURCES = [
  source('local-movies-api', 'Movies API', 10, 'Movies and shows by IMDb id'),
  source('local-shows-site', 'Shows Site', 20),
  { ...source('local-addon', 'My addon', 30), kind: 'stremio' } as ProviderView,
];

/** The catalog of definitions the sources step browses, and the ways to add a source. */
function mockAddSources() {
  for (const hook of [
    useAddCardigannProviderMutation,
    useAddStremioProviderMutation,
    useAddTorznabProviderMutation,
    useSyncDefinitionsMutation,
  ])
    mocked(hook).mockReturnValue([mutationTrigger(), { isLoading: false }] as never);
  mocked(useLoadDefinitionsMutation).mockReturnValue([
    mutationTrigger({
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
  ] as never);
}

function mockConfig(entries: ConfigEntryView[], sources: ProviderView[] = []) {
  mockAddSources();
  mocked(useGetProvidersQuery).mockReturnValue({ data: sources, isLoading: false } as never);
  mocked(useUpdateProviderMutation).mockReturnValue([mutationTrigger()] as never);
  mocked(useGetConfigQuery).mockReturnValue({ data: entries, isLoading: false } as never);
  mocked(useGetServiceStatusesQuery).mockReturnValue({ data: {}, isLoading: false } as never);
  mocked(useUpdateConfigMutation).mockReturnValue([
    mutationTrigger(),
    { isLoading: false },
  ] as never);
  // Test and Save succeed for the service they're given, as the server reports it
  const passed = (service: string, message: string) => ({
    success: true,
    services: [{ service, success: true, testMode: 'live', message }],
  });
  mocked(useTestServiceConfigMutation).mockReturnValue([
    mutationTriggerFrom(({ service }: { service: string }) =>
      passed(service, 'Connected with these settings.')
    ),
  ] as never);
  mocked(useSaveServiceConfigMutation).mockReturnValue([
    mutationTriggerFrom(({ service }: { service: string }) => ({
      ...passed(service, 'Saved.'),
      restarted: [],
      needsProcessRestart: [],
      changed: [],
      recovered: [],
    })),
  ] as never);
}

const meta = {
  title: 'Settings/Configuration',
  component: ConfigWizardPage,
  args: { onDismiss: fn() },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof ConfigWizardPage>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Every service's settings, from the rail's Configuration item: one control per kind of value. */
export const Configuration: Story = {
  beforeEach: () => mockConfig(ENTRIES),
};

/** The first-run wizard on a required service: the steps, the service, then Previous/Next. */
export const WizardRequiredStep: Story = {
  beforeEach: () =>
    mockConfig([
      ...ENTRIES,
      entry({
        key: 'TRAKT_CLIENT_ID',
        label: 'Trakt Client ID',
        serviceGroup: 'TRAKT',
        serviceDescription: 'Trakt lists and watchlist integration.',
        required: true,
        hasValue: false,
      }),
    ]),
  render: args => <ConfigurationWizardPage {...args} />,
};

/** The wizard's step after the required ones on a fresh install: no sources yet, add some. */
export const WizardSources: Story = {
  beforeEach: () => mockConfig(ENTRIES.map(item => ({ ...item, hasValue: true }))),
  render: args => <ConfigurationWizardPage {...args} />,
};

/** What a Stremio addon is: its info button pressed. */
export const WizardSourcesInfo: Story = {
  ...WizardSources,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'What is Stremio addon?' }));
    await waitFor(() => expect(canvas.getByText(/made for the Stremio app/)).toBeVisible());
  },
};

/** The Stremio addon page: how to get its install link, and the field to paste it. */
export const WizardSourcesStremio: Story = {
  ...WizardSources,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Stremio addon' }));
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Back to sources' })).toBeVisible()
    );
  },
};

/** The Jackett or Prowlarr page: a Torznab feed, its API key and a name. */
export const WizardSourcesJackett: Story = {
  ...WizardSources,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Jackett or Prowlarr' }));
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Back to sources' })).toBeVisible()
    );
  },
};

const indexer = (id: string, name: string, supports: Record<string, boolean>) => ({
  id,
  name,
  source: 'example/definitions',
  sourceLabel: 'example/definitions',
  status: 'ready',
  supported: true,
  reason: null,
  type: 'public',
  language: 'en-US',
  requiresFlareSolverr: false,
  installed: false,
  supports: {
    imdb: false,
    tmdb: false,
    tvdb: false,
    movies: false,
    tv: false,
    anime: false,
    ...supports,
  },
});

/** The indexer page: the community list of public indexers, searched and filtered. */
export const WizardSourcesCatalog: Story = {
  beforeEach: () => {
    mockConfig(ENTRIES.map(item => ({ ...item, hasValue: true })));
    mocked(useLoadDefinitionsMutation).mockReturnValue([
      mutationTrigger({
        entries: [
          indexer('movies-api', 'Movies API', { imdb: true, movies: true }),
          indexer('shows-site', 'Shows Site', { tv: true }),
        ],
        total: 2,
        sync: {
          lastSyncAt: new Date().toISOString(),
          syncing: false,
          total: 2,
          ready: 2,
          failed: 0,
          intervalMinutes: 60,
          sources: [],
        },
      }),
    ] as never);
  },
  render: args => <ConfigurationWizardPage {...args} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(await canvas.findByRole('button', { name: 'Find an indexer' }));
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: 'Back to sources' })).toBeVisible()
    );
  },
};

/**
 * The sources page an admin gets when the wizard didn't run (settings from `.env`), with sources
 * added and one on: Continue to Miauwatch.
 */
export const SourcesSetupAdded: Story = {
  beforeEach: () =>
    mockConfig(
      ENTRIES.map(item => ({ ...item, hasValue: true })),
      SOURCES.map((item, index) => ({ ...item, enabled: index === 0 }))
    ),
  render: () => <SourcesSetupPage onDismiss={fn()} />,
};

/** The wizard once everything required is set, with a source on: optional services, or finish. */
export const WizardOptional: Story = {
  beforeEach: () =>
    mockConfig(
      ENTRIES.map(item => ({ ...item, hasValue: true })),
      SOURCES.map((item, index) => ({ ...item, enabled: index === 0 }))
    ),
  render: args => <ConfigurationWizardPage {...args} />,
};

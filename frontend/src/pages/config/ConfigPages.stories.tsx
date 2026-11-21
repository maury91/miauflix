import {
  useGetConfigQuery,
  useGetServiceStatusesQuery,
  useSaveServiceConfigMutation,
  useTestServiceConfigMutation,
  useUpdateConfigMutation,
} from '@features/config/api/config.api';
import type { ConfigEntryView } from '@miauflix/backend';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, mocked } from 'storybook/test';

import ConfigurationWizardPage from './ConfigurationWizardPage';
import ConfigWizardPage from './ConfigWizardPage';

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

function mockConfig(entries: ConfigEntryView[]) {
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

/** The wizard once everything required is set: optional services to review, or finish. */
export const WizardOptional: Story = {
  beforeEach: () => mockConfig(ENTRIES.map(item => ({ ...item, hasValue: true }))),
  render: args => <ConfigurationWizardPage {...args} />,
};

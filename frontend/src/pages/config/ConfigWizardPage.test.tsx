import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  useGetConfigQuery: vi.fn(),
  useGetServiceStatusesQuery: vi.fn(),
  useUpdateConfigMutation: vi.fn(),
  useTestServiceConfigMutation: vi.fn(),
  useSaveServiceConfigMutation: vi.fn(),
}));
const sourcesMocks = vi.hoisted(() => ({
  useGetProvidersQuery: vi.fn(),
  useUpdateProviderMutation: vi.fn(),
  useLoadDefinitionsMutation: vi.fn(),
  useSyncDefinitionsMutation: vi.fn(),
  useAddCardigannProviderMutation: vi.fn(),
  useAddTorznabProviderMutation: vi.fn(),
  useAddStremioProviderMutation: vi.fn(),
}));

vi.mock('@features/config/api/config.api', () => mocks);
vi.mock('@features/sources/api/sources.api', () => sourcesMocks);
vi.mock('framer-motion', () => ({ motion: { div: 'div', main: 'main' } }));

import ConfigurationWizardPage from './ConfigurationWizardPage';
import ConfigWizardPage from './ConfigWizardPage';

const sourceView = (id: string, name: string, priority: number, enabled = false) => ({
  id,
  name,
  priority,
  enabled,
  description: null,
  kind: 'cardigann',
});

describe('ConfigWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useGetConfigQuery.mockReturnValue({
      data: [
        {
          key: 'CATALOG_SERVICE_URL',
          value: '',
          isSecret: false,
          serviceGroup: 'CATALOG',
          serviceDescription: 'Catalog service',
          description: 'Catalog service URL',
          required: true,
          hasValue: false,
          inputType: 'text',
        },
      ],
      isLoading: false,
    });
    mocks.useGetServiceStatusesQuery.mockReturnValue({ data: {}, isLoading: false });
    mocks.useUpdateConfigMutation.mockReturnValue([vi.fn(), { isLoading: false }]);
    mocks.useTestServiceConfigMutation.mockReturnValue([vi.fn()]);
    mocks.useSaveServiceConfigMutation.mockReturnValue([vi.fn()]);
    // A server that already has a source on: the wizard skips choosing them
    sourcesMocks.useGetProvidersQuery.mockReturnValue({
      data: [sourceView('local-movies', 'Movies API', 20, true)],
      isLoading: false,
    });
    sourcesMocks.useUpdateProviderMutation.mockReturnValue([vi.fn()]);
    for (const hook of [
      sourcesMocks.useLoadDefinitionsMutation,
      sourcesMocks.useSyncDefinitionsMutation,
      sourcesMocks.useAddCardigannProviderMutation,
      sourcesMocks.useAddTorznabProviderMutation,
      sourcesMocks.useAddStremioProviderMutation,
    ])
      hook.mockReturnValue([vi.fn(), { isLoading: false }]);
  });

  it('keeps the saved state until the service is edited again', async () => {
    const save = vi.fn().mockResolvedValue({
      data: {
        success: true,
        services: [
          {
            service: 'CATALOG',
            success: true,
            testMode: 'live',
            message: 'Catalog saved',
          },
        ],
        restarted: [],
        needsProcessRestart: [],
        changed: ['CATALOG'],
        recovered: [],
      },
    });
    mocks.useSaveServiceConfigMutation.mockReturnValue([save]);

    render(<ConfigWizardPage onDismiss={vi.fn()} />);

    const field = screen.getByRole('textbox', { name: 'Catalog Service URL' });
    fireEvent.change(field, { target: { value: 'http://catalog:3001' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save', exact: true }));
    });

    expect(screen.getByRole('button', { name: 'Saved', exact: true })).toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'http://catalog:3002' } });
    expect(screen.getByRole('button', { name: 'Save', exact: true })).toBeInTheDocument();
  }, 10_000);

  it('renders shared Trakt settings as one group and reports every consumer test', async () => {
    const test = vi.fn().mockResolvedValue({
      data: {
        success: true,
        services: [
          { service: 'CATALOG', success: true, testMode: 'live', message: 'Trakt ready' },
          { service: 'LIST', success: true, testMode: 'live', message: 'Trakt ready' },
        ],
      },
    });
    mocks.useGetConfigQuery.mockReturnValue({
      data: [
        {
          key: 'TRAKT_CLIENT_ID',
          value: '',
          isSecret: false,
          serviceGroup: 'TRAKT',
          serviceDescription: 'Shared Trakt settings',
          description: 'Client ID',
          required: true,
          hasValue: false,
          inputType: 'text',
        },
        {
          key: 'TRAKT_CLIENT_SECRET',
          value: '',
          isSecret: true,
          serviceGroup: 'TRAKT',
          serviceDescription: 'Shared Trakt settings',
          description: 'Client secret',
          required: true,
          hasValue: false,
          inputType: 'text',
        },
      ],
      isLoading: false,
    });
    mocks.useTestServiceConfigMutation.mockReturnValue([test]);

    render(<ConfigurationWizardPage onDismiss={vi.fn()} />);

    expect(screen.getAllByRole('heading', { name: 'Trakt' })).toHaveLength(1);
    fireEvent.change(screen.getByRole('textbox', { name: 'Trakt Client ID' }), {
      target: { value: 'client-id' },
    });
    fireEvent.change(screen.getByLabelText('Trakt Client Secret'), {
      target: { value: 'client-secret' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test', exact: true }));
    });
    await waitFor(() =>
      expect(screen.getByText(/CATALOG: Trakt ready · LIST: Trakt ready/)).toBeVisible()
    );
    expect(test).toHaveBeenCalledWith({
      service: 'TRAKT',
      entries: [
        { key: 'TRAKT_CLIENT_ID', value: 'client-id' },
        { key: 'TRAKT_CLIENT_SECRET', value: 'client-secret' },
      ],
    });
  });

  it('summarizes optional integrations and keeps runtime infrastructure under advanced settings', () => {
    const optionalEntry = (key: string, serviceGroup: string, hasValue = false) => ({
      key,
      value: hasValue ? 'configured' : '',
      isSecret: false,
      serviceGroup,
      serviceDescription: `${serviceGroup} settings`,
      description: `${key} description`,
      required: false,
      hasValue,
      inputType: 'text' as const,
    });

    mocks.useGetConfigQuery.mockReturnValue({
      data: [
        optionalEntry('TMDB_API_URL', 'CATALOG', true),
        optionalEntry('EPISODE_SYNC_MODE', 'CATALOG_RUNTIME'),
        optionalEntry('TRAKT_API_URL', 'LIST'),
        optionalEntry('JWT_TTL', 'JWT'),
        optionalEntry('QUEUE_URL', 'QUEUE'),
        optionalEntry('PORT', 'SERVER'),
      ],
      isLoading: false,
    });

    render(<ConfigurationWizardPage onDismiss={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Optional settings' })).toBeInTheDocument();
    expect(screen.getByText('Movie and show metadata from The Movie Database.')).toBeVisible();
    expect(screen.getByText('Trakt lists')).toBeVisible();
    expect(screen.getAllByText('Ready').length).toBeGreaterThan(0);

    const advanced = screen.getByText('Advanced settings (4 groups)');
    expect(advanced).toBeVisible();
    fireEvent.click(advanced);
    expect(screen.getByText('Catalog runtime')).toBeVisible();
    expect(screen.getByText('JWT')).toBeVisible();
    expect(screen.getByText('Connection to the background job queue.')).toBeVisible();
  });

  it('asks for sources after the required settings when none is on, and turns them on', async () => {
    const providers = [
      sourceView('local-ids', 'IDs API', 10),
      sourceView('local-movies', 'Movies API', 20),
    ];
    sourcesMocks.useGetProvidersQuery.mockReturnValue({ data: providers, isLoading: false });
    const update = vi.fn().mockReturnValue({ unwrap: () => Promise.resolve({}) });
    sourcesMocks.useUpdateProviderMutation.mockReturnValue([update]);
    mocks.useGetConfigQuery.mockReturnValue({
      data: [
        {
          key: 'TMDB_API_URL',
          value: 'https://api.themoviedb.org/3',
          isSecret: false,
          serviceGroup: 'CATALOG',
          serviceDescription: 'Catalog',
          description: 'TMDB API URL',
          required: false,
          hasValue: true,
          inputType: 'text',
        },
      ],
      isLoading: false,
    });

    const onSourcesChosen = vi.fn();
    render(<ConfigurationWizardPage onDismiss={vi.fn()} onSourcesChosen={onSourcesChosen} />);

    expect(screen.getByRole('heading', { name: 'Add your sources' })).toBeInTheDocument();
    expect(screen.getByText(/Miauwatch will not find anything to play/)).toBeVisible();
    const movies = screen.getByRole('switch', { name: /Movies API/ });
    expect(movies).not.toBeChecked();
    await act(async () => {
      fireEvent.click(movies);
    });
    expect(update).toHaveBeenCalledWith({ id: 'local-movies', enabled: true });

    // With no source on, moving on is setting them up later
    fireEvent.click(screen.getByRole('button', { name: 'Set up later' }));
    expect(screen.getByRole('heading', { name: 'Optional settings' })).toBeInTheDocument();
    expect(onSourcesChosen).toHaveBeenCalledTimes(1);
    // Previous goes back to the sources
    fireEvent.click(screen.getByRole('button', { name: 'Previous step' }));
    expect(screen.getByRole('heading', { name: 'Add your sources' })).toBeInTheDocument();
  });

  it('offers the ways to add a source on a fresh install, each saying what it is', () => {
    sourcesMocks.useGetProvidersQuery.mockReturnValue({ data: [], isLoading: false });
    mocks.useGetConfigQuery.mockReturnValue({ data: [], isLoading: false });

    render(<ConfigurationWizardPage onDismiss={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Add your sources' })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    for (const name of ['Stremio addon', 'Jackett or Prowlarr', 'Find an indexer'])
      expect(screen.getByRole('button', { name })).toBeVisible();

    const about = screen.getByRole('button', { name: 'What is Stremio addon?' });
    expect(about).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText(/made for the Stremio app/)).not.toBeVisible();
    fireEvent.click(about);
    expect(about).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/made for the Stremio app/)).toBeVisible();
    expect(screen.getByRole('link', { name: /Browse community addons/ })).toHaveAttribute(
      'href',
      'https://stremio-addons.net/addons?categories=torrents&sort=popular'
    );
  });

  it('adds an addon on its own page, turns it on and returns to the list', async () => {
    sourcesMocks.useGetProvidersQuery.mockReturnValue({ data: [], isLoading: false });
    mocks.useGetConfigQuery.mockReturnValue({ data: [], isLoading: false });
    const addStremio = vi.fn().mockReturnValue({
      unwrap: () => Promise.resolve({ id: 'local-addon', name: 'My addon' }),
    });
    sourcesMocks.useAddStremioProviderMutation.mockReturnValue([addStremio, { isLoading: false }]);
    const update = vi.fn().mockReturnValue({ unwrap: () => Promise.resolve({}) });
    sourcesMocks.useUpdateProviderMutation.mockReturnValue([update]);

    render(<ConfigurationWizardPage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stremio addon' }));

    expect(screen.getByRole('heading', { level: 1, name: 'Stremio addon' })).toBeInTheDocument();
    expect(screen.getByText(/ends in manifest.json/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Addon link', { selector: 'input' }), {
      target: { value: 'https://addon.example.com/manifest.json' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add addon' }));
    });

    expect(addStremio).toHaveBeenCalledWith({ url: 'https://addon.example.com/manifest.json' });
    expect(update).toHaveBeenCalledWith({ id: 'local-addon', enabled: true });
    expect(screen.getByRole('heading', { name: 'Add your sources' })).toBeInTheDocument();
    expect(screen.getByText('Added My addon and turned it on.')).toBeVisible();
  });

  it("leaves a way's page with Back", () => {
    sourcesMocks.useGetProvidersQuery.mockReturnValue({ data: [], isLoading: false });
    mocks.useGetConfigQuery.mockReturnValue({ data: [], isLoading: false });

    render(<ConfigurationWizardPage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Jackett or Prowlarr' }));
    expect(
      screen.getByRole('heading', { level: 1, name: 'Jackett or Prowlarr' })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to sources' }));
    expect(screen.getByRole('heading', { name: 'Add your sources' })).toBeInTheDocument();
  });

  it('offers the sources step when the sources service cannot list them yet', () => {
    sourcesMocks.useGetProvidersQuery.mockReturnValue({
      data: undefined,
      error: { status: 503 },
      isLoading: false,
      refetch: vi.fn(),
    });
    mocks.useGetConfigQuery.mockReturnValue({ data: [], isLoading: false });

    render(<ConfigurationWizardPage onDismiss={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Add your sources' })).toBeInTheDocument();
    expect(screen.getByText(/Could not load the sources/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Set up later' })).toBeEnabled();
  });
});

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => {
  const unwrap = (value: unknown) => ({ unwrap: () => Promise.resolve(value) });
  return {
    providers: [] as unknown[],
    repositories: [] as unknown[],
    updateProvider: vi.fn(),
    reorder: vi.fn(),
    testProvider: vi.fn(),
    addRepository: vi.fn(),
    refreshRepository: vi.fn(),
    removeRepository: vi.fn(),
    removeProvider: vi.fn(),
    addCardigann: vi.fn(),
    addTorznab: vi.fn(),
    loadDefinitions: vi.fn(),
    syncDefinitions: vi.fn(),
    catalog: [] as unknown[],
    sync: {} as Record<string, unknown>,
    unwrap,
  };
});

vi.mock('@features/sources/api/sources.api', () => ({
  useGetProvidersQuery: () => ({
    data: api.providers,
    isLoading: false,
    error: undefined,
    refetch: vi.fn(),
  }),
  useGetRepositoriesQuery: () => ({ data: api.repositories, error: undefined }),
  useUpdateProviderMutation: () => [api.updateProvider, { isLoading: false }],
  useReorderProvidersMutation: () => [api.reorder, { isLoading: false }],
  useTestProviderMutation: () => [api.testProvider, { isLoading: false }],
  useAddRepositoryMutation: () => [api.addRepository, { isLoading: false }],
  useRefreshRepositoryMutation: () => [api.refreshRepository, { isLoading: false }],
  useRemoveRepositoryMutation: () => [api.removeRepository, { isLoading: false }],
  useRemoveProviderMutation: () => [api.removeProvider, { isLoading: false }],
  useLoadDefinitionsMutation: () => [api.loadDefinitions],
  useSyncDefinitionsMutation: () => [api.syncDefinitions, { isLoading: false }],
  useAddCardigannProviderMutation: () => [api.addCardigann, { isLoading: false }],
  useAddTorznabProviderMutation: () => [api.addTorznab, { isLoading: false }],
}));

import SourcesPage from './SourcesPage';

const provider = (id: string, priority: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id.toUpperCase(),
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
});

beforeEach(() => {
  api.providers = [provider('indexer-a', 20), provider('indexer-b', 10), provider('tv-index', 30)];
  api.repositories = [
    {
      id: 'builtin:miauflix',
      url: 'builtin:miauflix',
      name: 'Miauflix',
      builtIn: true,
      lastFetchedAt: null,
      lastError: null,
      providerCount: 3,
    },
    {
      id: 'repo:1',
      url: 'https://repo.example/list.json',
      name: 'repo.example',
      builtIn: false,
      lastFetchedAt: '2026-11-01T10:00:00Z',
      lastError: 'Skipped providers owned by another repository: indexer-a',
      providerCount: 1,
    },
  ];
  api.catalog = [
    entry('anime-index', 'Anime Index', { anime: true, imdb: false, tv: true, movies: false }),
    entry('tv-index', 'TV INDEX', { imdb: true, movies: false }),
    entry('general-index', 'General Index', { flare: true }),
  ];
  api.sync = sync();
  api.loadDefinitions.mockReset().mockImplementation((args: { offset: number; limit: number }) => ({
    unwrap: () =>
      Promise.resolve({
        entries: api.catalog.slice(args.offset, args.offset + args.limit),
        total: api.catalog.length,
        sync: api.sync,
      }),
  }));
  api.syncDefinitions.mockReset().mockReturnValue(api.unwrap({ ...sync(), syncing: true }));
  for (const mock of [
    api.updateProvider,
    api.reorder,
    api.testProvider,
    api.addRepository,
    api.refreshRepository,
    api.removeRepository,
    api.removeProvider,
    api.addCardigann,
    api.addTorznab,
  ])
    mock.mockReset().mockReturnValue(api.unwrap({}));
});
afterEach(cleanup);

const entry = (
  id: string,
  name: string | null,
  options: {
    imdb?: boolean;
    movies?: boolean;
    tv?: boolean;
    anime?: boolean;
    flare?: boolean;
    supported?: boolean;
    reason?: string;
    type?: string;
    status?: string;
    installed?: boolean;
    source?: string;
    sourceLabel?: string;
  } = {}
) => ({
  id,
  source: options.source ?? 'Prowlarr/Indexers@master:definitions/v11',
  sourceLabel: options.sourceLabel ?? 'Prowlarr/Indexers',
  name,
  language: 'en-US',
  type: options.type ?? 'public',
  installed: options.installed ?? false,
  status: options.status ?? 'ready',
  supported: options.supported ?? true,
  reason: options.reason ?? null,
  supports: {
    imdb: options.imdb ?? false,
    tmdb: false,
    tvdb: false,
    movies: options.movies ?? true,
    tv: options.tv ?? true,
    anime: options.anime ?? false,
  },
  requiresFlareSolverr: options.flare ?? false,
});
const sync = (overrides: Record<string, unknown> = {}) => ({
  lastSyncAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  lastError: null,
  syncing: false,
  total: 3,
  ready: 3,
  pending: 0,
  failed: 0,
  lastChange: { added: 2, updated: 1, removed: 0, failed: 0 },
  intervalMinutes: 60,
  sources: [
    {
      key: 'Prowlarr/Indexers@master:definitions/v11',
      label: 'Prowlarr/Indexers',
      total: 3,
      lastSyncAt: new Date().toISOString(),
      lastError: null,
    },
  ],
  ...overrides,
});
const openMenu = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name: `More options for ${name}` }));
const openAdvanced = () => fireEvent.click(screen.getByRole('button', { name: /Advanced setup/ }));
const rows = () => within(screen.getByRole('list', { name: 'Sources' })).getAllByRole('listitem');

describe('SourcesPage', () => {
  it('explains what sources are and lists them by priority with usage and status', () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Sources', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/uses sources to find available files/)).toBeInTheDocument();
    expect(screen.getByText('How it works')).toBeInTheDocument();
    for (const step of ['Search', 'Find', 'Watch'])
      expect(screen.getByRole('heading', { name: step })).toBeInTheDocument();
    expect(screen.getByText('3 providers · 3 enabled')).toBeInTheDocument();
    const items = rows();
    expect(
      items.map(item => within(item).getByText(/^(INDEXER-B|INDEXER-A|TV-INDEX)$/).textContent)
    ).toEqual(['INDEXER-B', 'INDEXER-A', 'TV-INDEX']);
    expect(within(items[0]).getByText('12 / 2,000 requests today')).toBeInTheDocument();
    expect(
      within(items[0]).getByText('Public source from the Prowlarr/Jackett list')
    ).toBeInTheDocument();
    expect(within(items[0]).getByRole('img', { name: 'Enabled' })).toBeInTheDocument();
    expect(screen.getByText(/searched from top to bottom/)).toBeInTheDocument();
  });

  it('shows what each source says about itself, or what kind of source it is', () => {
    api.providers = [
      provider('indexer-a', 10, { description: ' Movies in small sizes ' }),
      provider('indexer-b', 20, { kind: 'torznab' }),
      provider('indexer-c', 30),
    ];
    render(<SourcesPage onDismiss={vi.fn()} />);
    const [first, second, third] = rows();
    expect(within(first).getByText('Movies in small sizes')).toBeInTheDocument();
    expect(within(second).getByText('Your own Jackett or Prowlarr source')).toBeInTheDocument();
    expect(
      within(third).getByText('Public source from the Prowlarr/Jackett list')
    ).toBeInTheDocument();
  });

  it('shows disabled sources as disabled', () => {
    api.providers = [provider('indexer-a', 10), provider('tv-index', 20, { enabled: false })];
    render(<SourcesPage onDismiss={vi.fn()} />);
    expect(screen.getByText('2 providers · 1 enabled')).toBeInTheDocument();
    const tvIndex = rows()[1];
    expect(within(tvIndex).getByText('Disabled', { selector: 'p' })).toBeInTheDocument();
    expect(within(tvIndex).getByRole('img', { name: 'Disabled' })).toBeInTheDocument();
  });

  it('moves providers from the options menu', async () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    openMenu('INDEXER-B');
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    openMenu('INDEXER-A');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Move up' }));
    expect(api.reorder).toHaveBeenCalledWith(['indexer-a', 'indexer-b', 'tv-index']);
    await waitFor(() => expect(screen.getByText('Moved INDEXER-A.')).toBeInTheDocument());
    openMenu('TV-INDEX');
    expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeDisabled();
  });

  it('reorders by dragging a row onto another', () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    const [first, , third] = rows();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.mouseDown(within(third).getByTitle('Drag to reorder'));
    fireEvent.dragStart(third, { dataTransfer });
    fireEvent.dragOver(first, { dataTransfer });
    fireEvent.drop(first, { dataTransfer });
    expect(api.reorder).toHaveBeenCalledWith(['tv-index', 'indexer-b', 'indexer-a']);
  });

  it.each([
    [1, ['indexer-a', 'indexer-b', 'tv-index']],
    [2, ['indexer-a', 'tv-index', 'indexer-b']],
  ])('moves a dragged first row down to position %s', (target, expected) => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    const items = rows();
    const dataTransfer = { setData: vi.fn(), effectAllowed: '' };
    fireEvent.mouseDown(within(items[0]).getByTitle('Drag to reorder'));
    fireEvent.dragStart(items[0], { dataTransfer });
    fireEvent.dragOver(items[target as number], { dataTransfer });
    fireEvent.drop(items[target as number], { dataTransfer });
    expect(api.reorder).toHaveBeenCalledWith(expected);
  });

  it('toggles a provider', () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Disable INDEXER-A' }));
    expect(api.updateProvider).toHaveBeenCalledWith({ id: 'indexer-a', enabled: false });
  });

  it('shows the real result of a provider test', async () => {
    api.testProvider.mockReturnValueOnce(api.unwrap({ success: false, message: 'Blocked' }));
    render(<SourcesPage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test INDEXER-A' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('INDEXER-A: Blocked');
    api.testProvider.mockReturnValueOnce(api.unwrap({ success: true, message: 'Reachable' }));
    fireEvent.click(screen.getByRole('button', { name: 'Test TV-INDEX' }));
    expect(await screen.findByText('TV-INDEX: Reachable')).toBeInTheDocument();
  });

  it('edits provider settings from the options menu', async () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    openMenu('INDEXER-A');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
    fireEvent.change(screen.getByLabelText('Daily request budget'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(api.updateProvider).toHaveBeenCalledWith({
        id: 'indexer-a',
        settings: { dailyBudget: '50' },
      })
    );
    await waitFor(() =>
      expect(screen.getByText('Saved settings for INDEXER-A.')).toBeInTheDocument()
    );
  });

  it.each(['seeders', ''])(
    'saves a select setting or resets it to its default (%s)',
    async value => {
      api.providers = [
        provider('indexer-a', 10, {
          settingsSchema: [
            {
              name: 'sort',
              type: 'select',
              label: 'Sort by',
              default: 'seeders',
              options: { seeders: 'Seeders', date: 'Newest' },
            },
          ],
          settings: { sort: 'date' },
        }),
      ];
      render(<SourcesPage onDismiss={vi.fn()} />);
      openMenu('INDEXER-A');
      fireEvent.click(screen.getByRole('menuitem', { name: 'Settings' }));
      const select = screen.getByRole('combobox', { name: 'Sort by' });
      expect(select).toHaveValue('date');
      expect(within(select).getByRole('option', { name: 'Seeders' })).toHaveValue('seeders');
      expect(within(select).getByRole('option', { name: 'Newest' })).toHaveValue('date');
      fireEvent.change(select, { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
      await waitFor(() =>
        expect(api.updateProvider).toHaveBeenCalledWith({
          id: 'indexer-a',
          settings: { sort: value },
        })
      );
    }
  );

  it('shows errors from a failed update', async () => {
    api.updateProvider.mockReturnValueOnce({
      unwrap: () => Promise.reject({ status: 400, data: 'Priority must be an integer' }),
    });
    render(<SourcesPage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Disable INDEXER-A' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Priority must be an integer');
  });

  it('keeps technical setup collapsed until asked, and Add source opens it', () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /Advanced setup/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Add Torznab endpoint')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Add source/ }));
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('heading', { name: 'Add Torznab endpoint' })).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('manages repositories inside Advanced setup', async () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    openAdvanced();
    const list = within(screen.getByRole('list', { name: 'Repositories' }));
    expect(list.getByText('built-in')).toBeInTheDocument();
    expect(list.getAllByRole('button', { name: /Remove/ })).toHaveLength(1);
    expect(list.getByText(/Skipped providers owned by another repository/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh repo.example' }));
    expect(api.refreshRepository).toHaveBeenCalledWith('repo:1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove repo.example' }));
    expect(api.removeRepository).toHaveBeenCalledWith('repo:1');

    expect(screen.getByRole('button', { name: 'Add repository' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Repository URL'), {
      target: { value: ' https://new.example/providers.json ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add repository' }));
    expect(api.addRepository).toHaveBeenCalledWith({ url: 'https://new.example/providers.json' });
    await waitFor(() => expect(screen.getByLabelText('Repository URL')).toHaveValue(''));
  });

  const browse = async () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    openAdvanced();
    fireEvent.click(screen.getByRole('button', { name: 'Browse indexers' }));
    await screen.findByRole('list', { name: 'Available indexers' });
  };
  const lastArgs = () => api.loadDefinitions.mock.calls.at(-1)![0];

  it('starts with public indexers that support IMDb search', async () => {
    await browse();
    expect(screen.getByRole('button', { name: 'IMDb search' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Public only' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: 'Anime' })).toHaveAttribute('aria-pressed', 'false');
    expect(api.loadDefinitions.mock.calls[0][0]).toMatchObject({
      imdb: true,
      publicOnly: true,
      tv: false,
      offset: 0,
      limit: 40,
    });
  });

  it('reloads from the top when a filter or the search changes', async () => {
    await browse();
    fireEvent.click(screen.getByRole('button', { name: 'IMDb search' }));
    fireEvent.click(screen.getByRole('button', { name: 'Anime' }));
    await waitFor(() => expect(lastArgs()).toMatchObject({ imdb: false, anime: true, offset: 0 }));
    fireEvent.change(screen.getByLabelText('Search indexers'), { target: { value: 'nya' } });
    await waitFor(() => expect(lastArgs()).toMatchObject({ query: 'nya', anime: true, offset: 0 }));
  });

  it('shows what each indexer supports and blocks unsupported ones', async () => {
    api.catalog = [
      entry('tv-index', 'TV INDEX', { imdb: true, movies: false }),
      entry('anime-index', 'Anime Index', { anime: true, tv: true, movies: false }),
      entry('general-index', 'General Index', { flare: true }),
      entry('secret', null, {
        supported: false,
        type: 'private',
        reason: 'Needs an account (private tracker)',
      }),
      entry('fresh', null, { status: 'pending' }),
    ];
    await browse();
    const tvIndex = await screen.findByLabelText('TV INDEX supports');
    expect(within(tvIndex).getByText('IMDb search')).toBeInTheDocument();
    expect(within(tvIndex).queryByText('Title search only')).not.toBeInTheDocument();
    expect(within(tvIndex).getByText('Public')).toBeInTheDocument();
    const nyaa = screen.getByLabelText('Anime Index supports');
    expect(within(nyaa).getByText('Anime')).toBeInTheDocument();
    expect(within(nyaa).getByText('Title search only')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('General Index supports')).getByText('Needs FlareSolverr')
    ).toBeInTheDocument();
    expect(screen.getByText('Needs an account (private tracker)')).toBeInTheDocument();
    // What a tracker that needs an account can do is still shown, so the filters make sense.
    expect(
      within(screen.getByLabelText('secret supports')).getByText('private')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add secret' })).toBeDisabled();
    expect(screen.getByText('Not read yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add anime-index' })).toBeEnabled();
  });

  it('adds an indexer and marks it added', async () => {
    api.addCardigann.mockReturnValueOnce(api.unwrap({ name: 'Anime Index' }));
    await browse();
    fireEvent.click(await screen.findByRole('button', { name: 'Add anime-index' }));
    expect(api.addCardigann).toHaveBeenCalledWith({
      id: 'anime-index',
      source: 'Prowlarr/Indexers@master:definitions/v11',
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add anime-index' })).toHaveTextContent('Added')
    );
    expect(
      screen.getByText('Added Anime Index. Turn it on when you are ready.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add anime-index' })).toBeDisabled();
  });

  it('shows why an indexer could not be added', async () => {
    api.addCardigann.mockReturnValueOnce({
      unwrap: () => Promise.reject({ status: 400, data: 'Unsupported Cardigann feature: login' }),
    });
    await browse();
    fireEvent.click(await screen.findByRole('button', { name: 'Add anime-index' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported Cardigann feature');
  });

  it('pages through a long list and says how many match', async () => {
    api.catalog = Array.from({ length: 100 }, (_, i) =>
      entry(`site-${String(i).padStart(3, '0')}`, null)
    );
    api.sync = sync({ total: 586 });
    await browse();
    await screen.findByText('Showing 40 of 100 matching indexers (586 in total)');
    // jsdom has no IntersectionObserver, so the list offers a button instead.
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    await screen.findByText('Showing 80 of 100 matching indexers (586 in total)');
    expect(lastArgs()).toMatchObject({ offset: 40, limit: 40 });
    expect(screen.getAllByLabelText(/^Add site-/)).toHaveLength(80);
  }, 15_000);

  it('loads the next page when the end of the list scrolls into view', async () => {
    let notify: (entries: { isIntersecting: boolean }[]) => void = () => undefined;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          notify = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    try {
      api.catalog = Array.from({ length: 60 }, (_, i) => entry(`site-${i}`, null));
      await browse();
      await screen.findByText(/Showing 40 of 60/);
      expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
      act(() => notify([{ isIntersecting: true }]));
      await screen.findByText(/Showing 60 of 60/);
      expect(lastArgs()).toMatchObject({ offset: 40 });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('stops automatic pagination after a failure and allows an explicit retry', async () => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        active = true;
        constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
        observe() {
          queueMicrotask(() => {
            if (this.active) this.callback([{ isIntersecting: true }]);
          });
        }
        disconnect() {
          this.active = false;
        }
      }
    );
    try {
      const catalog = Array.from({ length: 41 }, (_, i) => entry(`site-${i}`, null));
      api.loadDefinitions
        .mockReturnValueOnce(api.unwrap({ entries: catalog.slice(0, 40), total: 41, sync: sync() }))
        .mockReturnValueOnce({
          unwrap: () => Promise.reject({ status: 500, data: 'Page unavailable' }),
        })
        .mockReturnValue({ unwrap: () => new Promise(() => {}) });
      await browse();
      expect(await screen.findByRole('alert')).toHaveTextContent('Page unavailable');
      const retry = screen.getByRole('button', { name: 'Show more' });
      await act(async () => {});
      expect(api.loadDefinitions).toHaveBeenCalledTimes(2);
      api.loadDefinitions.mockReturnValueOnce(
        api.unwrap({ entries: catalog.slice(40), total: 41, sync: sync() })
      );
      fireEvent.click(retry);
      await screen.findByText(/Showing 41 of 41/);
      expect(api.loadDefinitions).toHaveBeenCalledTimes(3);
      expect(lastArgs()).toMatchObject({ offset: 40 });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    } finally {
      cleanup();
      vi.unstubAllGlobals();
    }
  }, 15_000);

  it('reports when the list was last updated and what changed', async () => {
    await browse();
    expect(
      await screen.findByText('Updated 5 min ago (2 added, 1 updated). Refreshes every hour.')
    ).toBeInTheDocument();
  });

  it('checks for updates now and follows the sync until it finishes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await browse();
      await screen.findByText(/Updated 5 min ago/);
      fireEvent.click(screen.getByRole('button', { name: 'Check for updates' }));
      expect(api.syncDefinitions).toHaveBeenCalled();
      expect(await screen.findByText('Updating indexers… 3 of 3 read')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Check for updates' })).toBeDisabled();
      // The poll sees the sync has finished and reloads the list.
      api.sync = sync({ lastChange: { added: 0, updated: 2, removed: 1, failed: 0 } });
      const callsBefore = api.loadDefinitions.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4500);
      });
      await screen.findByText('Updated 5 min ago (2 updated, 1 removed). Refreshes every hour.');
      expect(api.loadDefinitions.mock.calls.length).toBeGreaterThan(callsBefore);
      expect(api.loadDefinitions.mock.calls.some(([args]) => args.limit === 0)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('explains an empty or failing list', async () => {
    api.catalog = [];
    api.sync = sync({
      total: 0,
      lastSyncAt: null,
      sources: [
        {
          key: 'Prowlarr/Indexers@master:definitions/v11',
          label: 'Prowlarr/Indexers',
          total: 0,
          lastSyncAt: null,
          lastError: 'Definition source returned HTTP 503',
        },
      ],
    });
    await browse();
    expect(await screen.findByText(/No indexers yet/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Last update of Prowlarr/Indexers failed: Definition source returned HTTP 503'
    );
    expect(screen.getByText('The indexer list has not been downloaded yet.')).toBeInTheDocument();
  });

  it('lets you pick a definition source when there are several, and says where each comes from', async () => {
    const jackettKey = 'Jackett/Jackett@master:src/Jackett.Common/Definitions';
    api.catalog = [
      entry('anime-index', 'Anime Index', {}),
      entry('anime-index', 'Anime Index', { source: jackettKey, sourceLabel: 'Jackett/Jackett' }),
    ];
    api.sync = sync({
      sources: [
        {
          key: 'Prowlarr/Indexers@master:definitions/v11',
          label: 'Prowlarr/Indexers',
          total: 580,
          lastSyncAt: null,
          lastError: null,
        },
        {
          key: jackettKey,
          label: 'Jackett/Jackett',
          total: 585,
          lastSyncAt: null,
          lastError: null,
        },
      ],
    });
    api.addCardigann.mockReturnValueOnce(api.unwrap({ name: 'Anime Index (Jackett/Jackett)' }));
    await browse();
    // The same indexer from two sources is told apart by where it comes from.
    const adds = await screen.findAllByRole('button', { name: /^Add anime-index from / });
    expect(adds.map(button => button.getAttribute('aria-label'))).toEqual([
      'Add anime-index from Prowlarr/Indexers',
      'Add anime-index from Jackett/Jackett',
    ]);
    expect(screen.getAllByText('Prowlarr/Indexers').length).toBeGreaterThan(0);
    const select = screen.getByLabelText('Source');
    expect(
      within(select)
        .getAllByRole('option')
        .map(option => option.textContent)
    ).toEqual(['All sources', 'Prowlarr/Indexers (580)', 'Jackett/Jackett (585)']);
    fireEvent.change(select, { target: { value: jackettKey } });
    await waitFor(() => expect(lastArgs()).toMatchObject({ source: jackettKey, offset: 0 }));
    fireEvent.click(adds[1]);
    expect(api.addCardigann).toHaveBeenCalledWith({ id: 'anime-index', source: jackettKey });
    await waitFor(() =>
      expect(screen.getByText(/Added Anime Index \(Jackett\/Jackett\)/)).toBeInTheDocument()
    );
  });

  it('does not show a source picker when there is only one', async () => {
    await browse();
    expect(screen.queryByLabelText('Source')).not.toBeInTheDocument();
    expect(lastArgs().source).toBe('');
  });

  it('adds a Torznab endpoint', async () => {
    api.addTorznab.mockReturnValueOnce(api.unwrap({ name: 'My Jackett' }));
    render(<SourcesPage onDismiss={vi.fn()} />);
    openAdvanced();
    expect(screen.getByRole('button', { name: 'Add endpoint' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' My Jackett ' } });
    fireEvent.change(screen.getByLabelText('Torznab URL'), {
      target: { value: 'http://jackett:9117/api' },
    });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'k' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add endpoint' }));
    expect(api.addTorznab).toHaveBeenCalledWith({
      name: 'My Jackett',
      baseUrl: 'http://jackett:9117/api',
      apiKey: 'k',
    });
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''));
  });

  it('removes only providers the admin added, and flags FlareSolverr', () => {
    api.providers = [
      provider('indexer-a', 10),
      provider('torznab-mine', 20, { repositoryId: 'local:user', kind: 'torznab' }),
      provider('jackett-x', 30, { repositoryId: 'local:user', requiresFlareSolverr: true }),
    ];
    render(<SourcesPage onDismiss={vi.fn()} />);
    openMenu('INDEXER-A');
    expect(screen.queryByRole('menuitem', { name: 'Remove' })).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    openMenu('TORZNAB-MINE');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }));
    expect(api.removeProvider).toHaveBeenCalledWith('torznab-mine');
    expect(screen.getByText('needs FlareSolverr')).toBeInTheDocument();
  });

  it('goes back with the back arrow and the remote back key', () => {
    const onDismiss = vi.fn();
    render(<SourcesPage onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Back to Settings' }), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});

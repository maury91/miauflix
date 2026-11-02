import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
}));

import SourcesPage from './SourcesPage';

const provider = (id: string, priority: number, overrides: Record<string, unknown> = {}) => ({
  id,
  name: id.toUpperCase(),
  kind: 'native',
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
  api.providers = [provider('yts', 20), provider('therarbg', 10), provider('eztv', 30)];
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
      lastError: 'Skipped providers owned by another repository: yts',
      providerCount: 1,
    },
  ];
  for (const mock of [
    api.updateProvider,
    api.reorder,
    api.testProvider,
    api.addRepository,
    api.refreshRepository,
    api.removeRepository,
  ])
    mock.mockReset().mockReturnValue(api.unwrap({}));
});
afterEach(cleanup);

describe('SourcesPage', () => {
  it('lists providers by priority with usage and health', () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    const items = within(screen.getByRole('list', { name: 'Providers' })).getAllByRole('article');
    expect(items.map(item => within(item).getByRole('heading').textContent)).toEqual([
      expect.stringContaining('THERARBG'),
      expect.stringContaining('YTS'),
      expect.stringContaining('EZTV'),
    ]);
    expect(within(items[0]).getByText(/Today 12 \/ 2000 requests/)).toBeInTheDocument();
    expect(within(items[0]).getByRole('img', { name: 'Health: ok' })).toBeInTheDocument();
  });

  it('moves providers with the up and down buttons', async () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Move THERARBG up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move EZTV down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move YTS up' }));
    expect(api.reorder).toHaveBeenCalledWith(['yts', 'therarbg', 'eztv']);
    await waitFor(() => expect(screen.getByText('Moved YTS.')).toBeInTheDocument());
  });

  it('toggles a provider', () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Disable YTS' }));
    expect(api.updateProvider).toHaveBeenCalledWith({ id: 'yts', enabled: false });
  });

  it('shows the result of a provider test', async () => {
    api.testProvider.mockReturnValueOnce(api.unwrap({ success: false, message: 'Blocked' }));
    render(<SourcesPage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Test YTS' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('YTS: Blocked');
  });

  it('edits provider settings', async () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings for YTS' }));
    fireEvent.change(screen.getByLabelText('Daily request budget'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    await waitFor(() =>
      expect(api.updateProvider).toHaveBeenCalledWith({
        id: 'yts',
        settings: { dailyBudget: '50' },
      })
    );
    await waitFor(() => expect(screen.getByText('Saved settings for YTS.')).toBeInTheDocument());
  });

  it('shows errors from a failed update', async () => {
    api.updateProvider.mockReturnValueOnce({
      unwrap: () => Promise.reject({ status: 400, data: 'Priority must be an integer' }),
    });
    render(<SourcesPage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Disable YTS' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Priority must be an integer');
  });

  it('manages repositories', async () => {
    render(<SourcesPage onDismiss={vi.fn()} />);
    const list = within(screen.getByRole('list', { name: 'Repositories' }));
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

  it('goes back with the Back button and the remote back key', () => {
    const onDismiss = vi.fn();
    render(<SourcesPage onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Back to Settings' }), { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });
});

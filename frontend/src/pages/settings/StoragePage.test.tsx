import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storageApi = vi.hoisted(() => ({
  data: null as {
    summary: {
      physicalBytes: number | null;
      storageBudgetBytes: number;
      reservedBytes: number;
      chargedBytes: number;
      filesystem: { totalBytes: number; freeBytes: number } | null;
    };
    items: Array<{
      sourceId: number;
      kind: 'movie' | 'episode' | 'anime' | 'unknown';
      title: string;
      subtitle: string | null;
      image: string | null;
      remuxBytes: number;
      fileName: string | null;
      quality: string | null;
      physicalBytes: number | null;
      reservedBytes: number;
      progressPercent: number;
      videoComplete: boolean;
      activity: 'inactive' | 'active' | 'available_offline' | 'local_only';
      torrentLoaded: boolean;
      activeStreams: number;
      seedEndsAt: string | null;
    }>;
  } | null,
  error: undefined as unknown,
  refetch: vi.fn(),
  removeStorage: vi.fn(),
  removalLoading: false,
}));

const configApi = vi.hoisted(() => ({
  entries: [] as Array<Record<string, unknown>>,
  save: vi.fn(),
}));

vi.mock('@features/config/api/config.api', () => ({
  useGetConfigQuery: () => ({ data: configApi.entries, isLoading: false, error: undefined }),
  useSaveServiceConfigMutation: () => [configApi.save, { isLoading: false }],
}));

const configEntry = (key: string, value: string, extra: Record<string, unknown> = {}) => ({
  key,
  value,
  isSecret: false,
  serviceGroup: 'MEDIA_LOAD',
  serviceDescription: 'Torrent engine',
  description: `About ${key}`,
  required: false,
  hasValue: true,
  inputType: 'text',
  ...extra,
});

vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, motion: { ...actual.motion, main: 'main' } };
});

vi.mock('@features/storage/api/storage.api', () => ({
  useGetStorageInventoryQuery: () => ({
    data: storageApi.data,
    error: storageApi.error,
    isLoading: false,
    isFetching: false,
    refetch: storageApi.refetch,
  }),
  useRemoveStorageMutation: () => [
    storageApi.removeStorage,
    { isLoading: storageApi.removalLoading },
  ],
}));

import { computeUsage } from './storage/storageInventory';
import StoragePage from './StoragePage';

const baseItem = {
  sourceId: 7,
  kind: 'movie' as 'movie' | 'episode' | 'anime' | 'unknown',
  title: 'Example Film',
  subtitle: '2024' as string | null,
  image: '/example-backdrop.jpg' as string | null,
  remuxBytes: 0,
  fileName: 'example.mkv',
  quality: '1080p',
  physicalBytes: 2 * 1024 * 1024 * 1024,
  reservedBytes: 3 * 1024 * 1024 * 1024,
  progressPercent: 100,
  videoComplete: true,
  activity: 'local_only' as const,
  torrentLoaded: false,
  activeStreams: 0,
  seedEndsAt: null,
};

beforeEach(() => {
  storageApi.data = {
    summary: {
      physicalBytes: baseItem.physicalBytes,
      storageBudgetBytes: 50 * 1024 * 1024 * 1024,
      reservedBytes: baseItem.reservedBytes,
      chargedBytes: baseItem.reservedBytes,
      filesystem: { totalBytes: 100 * 1024 ** 3, freeBytes: 40 * 1024 ** 3 },
    },
    items: [{ ...baseItem }],
  };
  storageApi.error = undefined;
  configApi.entries = [
    configEntry('CONTENT_DOWNLOAD_LIMIT', '20MB'),
    configEntry('STORAGE_THRESHOLD', '50GB'),
    configEntry('STORAGE_PLAYBACK_RESERVE', '10GB'),
    configEntry('CONTENT_SEED_DURATION_SECONDS', '3600', { inputType: 'number' }),
    configEntry('DOWNLOAD_PATH', '/downloads', { advanced: true }),
    configEntry('DOWNLOAD_PATH_EXCLUSIVE', 'true', { inputType: 'boolean', advanced: true }),
    configEntry('STORAGE_PAD_FILE_SIZES', 'true', { inputType: 'boolean', advanced: true }),
  ];
  configApi.save.mockReset();
  configApi.save.mockResolvedValue({ data: { success: true, services: [] } });
  storageApi.refetch.mockReset();
  storageApi.removeStorage.mockReset();
  storageApi.removalLoading = false;
  // jsdom lays nothing out: give every element a box, so the navigation layer can focus it
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
});
afterEach(() => {
  cleanup();
  vi.mocked(Element.prototype.getClientRects).mockRestore();
});

const focused = () => document.querySelector('[data-focused]');
/** As a pointer does: onto the control, then a click. */
const pointerPress = (element: HTMLElement) => {
  fireEvent.mouseMove(element, { clientX: 1, clientY: 1 });
  fireEvent.click(element);
};
const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key });

describe('Storage settings page', () => {
  it('shows the disk by kind of data, the limit, and each download with its artwork', () => {
    render(<StoragePage onDismiss={vi.fn()} />);
    const legend = within(screen.getByRole('list', { name: 'Space used by file type' }));
    expect(legend.getByText('Movies').parentElement).toHaveTextContent('Movies2 GiB');
    // The disk's 60 GiB in use, less Miauflix's 2 GiB
    expect(legend.getByText('Other data').parentElement).toHaveTextContent('Other data58 GiB');
    // The disk's 40 GiB free, less the 10 GiB kept for playback
    expect(legend.getByText('Free').parentElement).toHaveTextContent('Free30 GiB');
    // What Miauflix doesn't control comes last
    expect(legend.getAllByRole('listitem').at(-1)).toHaveTextContent('Other data58 GiB');
    expect(screen.getByText('Limit 50 GiB')).toBeInTheDocument();
    expect(screen.getByText(/used or reserved 3 GiB of its 50 GiB limit/)).toBeInTheDocument();
    expect(
      screen.getByText(
        /Local only\. The video is complete and Miauflix will keep it on this server without reloading its torrent/
      )
    ).toBeInTheDocument();
    const row = within(screen.getByRole('list', { name: 'Downloaded content' }));
    expect(row.getByText('Example Film')).toBeInTheDocument();
    expect(row.getByText('Movie')).toBeInTheDocument();
    expect(row.getByText(/1080p · 2 GiB · Local only · Video complete/)).toBeInTheDocument();
    expect(row.getByText(/example\.mkv · 3 GiB reserved/)).toBeInTheDocument();
    expect(
      document.querySelector('img[src="https://image.tmdb.org/t/p/w300/example-backdrop.jpg"]')
    ).not.toBeNull();
  });

  it('counts TV remuxes apart from the media and names episodes by show and episode', () => {
    storageApi.data!.items = [
      { ...baseItem, remuxBytes: 512 * 1024 ** 2 },
      {
        ...baseItem,
        sourceId: 8,
        kind: 'anime',
        title: 'Example Anime',
        subtitle: 'S01E03 · The Third',
        physicalBytes: 1024 ** 3,
      },
    ];
    render(<StoragePage onDismiss={vi.fn()} />);
    const legend = within(screen.getByRole('list', { name: 'Space used by file type' }));
    expect(legend.getByText('Movies').parentElement).toHaveTextContent('Movies1.5 GiB');
    expect(legend.getByText('TV remuxes').parentElement).toHaveTextContent('TV remuxes512 MiB');
    expect(legend.getByText('Anime').parentElement).toHaveTextContent('Anime1 GiB');
    expect(screen.getByText('S01E03 · The Third')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Delete download for Example Anime (S01E03 · The Third)' })
    ).toBeInTheDocument();
  });

  it('sorts the downloads', () => {
    storageApi.data!.items = [
      { ...baseItem, sourceId: 1, title: 'Zeta', physicalBytes: 3 * 1024 ** 3 },
      { ...baseItem, sourceId: 2, title: 'Alpha', physicalBytes: 1024 ** 3 },
      {
        ...baseItem,
        sourceId: 3,
        title: 'Mid',
        physicalBytes: 2 * 1024 ** 3,
        videoComplete: false,
        progressPercent: 10,
      },
    ];
    render(<StoragePage onDismiss={vi.fn()} />);
    const titles = () =>
      within(screen.getByRole('list', { name: 'Downloaded content' }))
        .getAllByRole('listitem')
        .map(item => within(item).getByText(/^(Zeta|Alpha|Mid)$/).textContent);
    expect(titles()).toEqual(['Zeta', 'Mid', 'Alpha']);
    const sort = screen.getByRole('combobox', { name: 'Sort by' });
    fireEvent.change(sort, { target: { value: 'name' } });
    expect(titles()).toEqual(['Alpha', 'Mid', 'Zeta']);
    fireEvent.change(sort, { target: { value: 'progress' } });
    expect(titles()[0]).toBe('Mid');
  });

  it('still fills the bar when the server leaves out the kind and remux size', () => {
    const olderItem: Partial<typeof baseItem> = { ...baseItem };
    delete olderItem.kind;
    delete olderItem.remuxBytes;
    storageApi.data!.items = [olderItem as typeof baseItem];
    render(<StoragePage onDismiss={vi.fn()} />);
    const legend = within(screen.getByRole('list', { name: 'Space used by file type' }));
    expect(legend.getByText('Unmatched downloads').parentElement).toHaveTextContent(
      'Unmatched downloads2 GiB'
    );
    expect(legend.getByText('Other data').parentElement).toHaveTextContent('Other data58 GiB');
    expect(screen.getByText('60 GiB / 100 GiB')).toBeInTheDocument();
  });

  it('shows the storage settings in friendly units, with the reserve on the bar', () => {
    render(<StoragePage onDismiss={vi.fn()} />);
    expect((screen.getByLabelText('Storage limit') as HTMLInputElement).value).toBe('50');
    expect(screen.getByLabelText('Storage limit unit')).toHaveValue('GB');
    expect((screen.getByLabelText('Seeding after download') as HTMLInputElement).value).toBe('1');
    expect(screen.getByLabelText('Seeding after download unit')).toHaveValue('h');
    // Only the storage settings, not the rest of media-load's
    expect(screen.queryByText(/CONTENT_DOWNLOAD_LIMIT/)).not.toBeInTheDocument();
    const legend = within(screen.getByRole('list', { name: 'Space used by file type' }));
    expect(legend.getByText('Reserved for playback').parentElement).toHaveTextContent(
      'Reserved for playback10 GiB'
    );
    expect(screen.getByText(/stops downloading in advance at 40 GiB/)).toBeInTheDocument();
    expect(screen.getByText(/sharing completed downloads for 1 hour/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('previews a new limit on the bar and saves the settings in their stored form', async () => {
    render(<StoragePage onDismiss={vi.fn()} />);
    const limit = screen.getByLabelText('Storage limit');
    fireEvent.focus(limit);
    fireEvent.change(limit, { target: { value: '30' } });
    fireEvent.blur(limit);
    expect(screen.getByText('Limit 30 GiB (not saved)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Seeding after download unit'), {
      target: { value: 'd' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('Storage settings saved.')).toBeInTheDocument());
    expect(configApi.save).toHaveBeenCalledWith({
      service: 'MEDIA_LOAD',
      entries: expect.arrayContaining([
        { key: 'STORAGE_THRESHOLD', value: '30GB' },
        { key: 'CONTENT_SEED_DURATION_SECONDS', value: '86400' },
      ]),
    });
    const sent = configApi.save.mock.calls[0]![0] as { entries: { key: string }[] };
    expect(sent.entries.map(entry => entry.key)).not.toContain('CONTENT_DOWNLOAD_LIMIT');
    expect(storageApi.refetch).toHaveBeenCalled();
  });

  it('warns when the limit is more than the disk can hold', () => {
    render(<StoragePage onDismiss={vi.fn()} />);
    const limit = screen.getByLabelText('Storage limit');
    fireEvent.focus(limit);
    fireEvent.change(limit, { target: { value: '500' } });
    fireEvent.blur(limit);
    // 40 GiB free plus the 2 GiB Miauflix holds
    expect(
      screen.getByText(/exceeds the space Miauflix can use on this disk \(42 GiB\)/)
    ).toBeInTheDocument();
  });

  it('previews and warns about a limit of 0, which keeps nothing', () => {
    render(<StoragePage onDismiss={vi.fn()} />);
    const limit = screen.getByLabelText('Storage limit');
    fireEvent.focus(limit);
    fireEvent.change(limit, { target: { value: '0' } });
    fireEvent.blur(limit);
    expect(screen.getByText('Limit 0 B (not saved)')).toBeInTheDocument();
    expect(
      screen.getByText(/A storage limit of 0 prevents Miauflix from saving downloads/)
    ).toBeInTheDocument();
  });

  it('shows a seeding time that is not a whole number of minutes in seconds', () => {
    configApi.entries = configApi.entries.map(entry =>
      entry['key'] === 'CONTENT_SEED_DURATION_SECONDS' ? { ...entry, value: '90' } : entry
    );
    render(<StoragePage onDismiss={vi.fn()} />);
    expect((screen.getByLabelText('Seeding after download') as HTMLInputElement).value).toBe('90');
    expect((screen.getByLabelText('Seeding after download unit') as HTMLSelectElement).value).toBe(
      's'
    );
  });

  it('reports a rejected save', async () => {
    configApi.save.mockResolvedValue({
      data: { success: false, services: [], invalidKeys: ['STORAGE_THRESHOLD'] },
    });
    render(<StoragePage onDismiss={vi.fn()} />);
    const limit = screen.getByLabelText('Storage limit');
    fireEvent.focus(limit);
    fireEvent.change(limit, { target: { value: '30' } });
    fireEvent.blur(limit);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Check these values: STORAGE_THRESHOLD.')).toBeInTheDocument();
  });

  it('spans the limit when the disk size is unknown', () => {
    storageApi.data!.summary.filesystem = null;
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Storage usage' })).toBeInTheDocument();
    const legend = within(screen.getByRole('list', { name: 'Space used by file type' }));
    expect(legend.queryByText('Other data')).not.toBeInTheDocument();
    expect(legend.queryByText('Free')).not.toBeInTheDocument();
  });

  it('says usage is unavailable, not zero, when neither the disk nor a download is measured', () => {
    storageApi.data!.summary.filesystem = null;
    storageApi.data!.items[0] = { ...storageApi.data!.items[0]!, physicalBytes: null };
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByText('Usage unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('shows a percentage, not NaN, for a disk that reports no size', () => {
    storageApi.data!.summary.filesystem = { totalBytes: 0, freeBytes: 0 };
    storageApi.data!.items = [];
    const usage = computeUsage(storageApi.data!);
    expect(usage.totalBytes).toBe(1);
    expect(usage.usedBytes).toBe(0);
  });

  it('shows a complete video as available offline while it can still be loaded by torrent', () => {
    storageApi.data!.items[0] = {
      ...baseItem,
      activity: 'available_offline',
      torrentLoaded: true,
      seedEndsAt: '2026-10-08T11:00:00.000Z',
    };
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByText(/Available offline · Video complete/)).toBeInTheDocument();
    expect(screen.getByText(/Torrent loaded until/)).toBeInTheDocument();
  });

  it('shows an incomplete loaded torrent as active', () => {
    storageApi.data!.items[0] = {
      ...baseItem,
      progressPercent: 75,
      videoComplete: false,
      activity: 'active',
      torrentLoaded: true,
    };
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByText(/Active · 75% downloaded/)).toBeInTheDocument();
  });

  it('shows an incomplete unloaded download as inactive', () => {
    storageApi.data!.items[0] = {
      ...baseItem,
      progressPercent: 34,
      videoComplete: false,
      activity: 'inactive',
      torrentLoaded: false,
    };
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByText(/Inactive · 34% downloaded/)).toBeInTheDocument();
  });

  it('formats large byte counts with explicit binary units instead of compact-number suffixes', () => {
    storageApi.data!.summary.physicalBytes = 1_000_000_000;
    storageApi.data!.items[0] = { ...baseItem, physicalBytes: 1_000_000_000 };
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getAllByText(/953\.7 MiB/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/BB/)).not.toBeInTheDocument();
  });

  it('shows the empty state when no content is stored', () => {
    storageApi.data!.items = [];
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByText('No downloads stored on this server.')).toBeInTheDocument();
  });

  it('offers retry when the inventory cannot be loaded', () => {
    storageApi.data = null;
    storageApi.error = { status: 500 };
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load storage');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(storageApi.refetch).toHaveBeenCalled();
  });

  it('keeps stale inventory visible and offers retry after a refresh error', () => {
    storageApi.error = { status: 500 };
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the last available data');
    expect(screen.getByText('Example Film')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(storageApi.refetch).toHaveBeenCalled();
  });

  it('lets the admin cancel a removal without calling the API', () => {
    render(<StoragePage onDismiss={vi.fn()} />);
    const free = screen.getByRole('button', { name: 'Delete download for Example Film' });
    pointerPress(free);
    const dialog = screen.getByRole('dialog', { name: 'Delete download for Example Film?' });
    expect(dialog).toHaveAccessibleDescription(/This frees up 2 GiB on the server/);
    // The least destructive choice comes first, and takes focus
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    expect(focused()).toBe(cancel);
    fireEvent.click(cancel);
    expect(storageApi.removeStorage).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(focused()).toBe(free);
  });

  it('closes the confirmation on Back, then leaves the page on the next Back', () => {
    const onDismiss = vi.fn();
    render(<StoragePage onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete download for Example Film' }));
    press('Escape');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onDismiss).not.toHaveBeenCalled();
    press('Escape');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('frees a selected item, announces success, refreshes, and restores focus', async () => {
    storageApi.removeStorage.mockImplementation(() => ({
      unwrap: async () => ({ success: true }),
    }));
    render(<StoragePage onDismiss={vi.fn()} />);
    pointerPress(screen.getByRole('button', { name: 'Delete download for Example Film' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete download' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(storageApi.removeStorage).toHaveBeenCalledWith(7);
    expect(storageApi.refetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Freed .* used by Example Film/)).toBeInTheDocument();
    expect(focused()).toBe(
      screen.getByRole('button', { name: 'Delete download for Example Film' })
    );
  });

  it('prevents removing a download while it is being watched', () => {
    storageApi.data!.items[0] = { ...baseItem, activeStreams: 1 };
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByText(/Playing now/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete download for Example Film' })).toBeDisabled();
  });

  it('keeps the confirmation open and explains an API deletion failure', async () => {
    storageApi.removeStorage.mockImplementation(() => ({
      unwrap: async () => {
        throw { data: { error: 'This download is currently being watched' } };
      },
    }));
    render(<StoragePage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete download for Example Film' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete download' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This download is currently being watched'
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

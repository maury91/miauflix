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
    const legend = within(screen.getByRole('list', { name: 'Space by kind' }));
    expect(legend.getByText('Movies').parentElement).toHaveTextContent('Movies2 GiB');
    // The disk's 60 GiB in use, less Miauflix's 2 GiB
    expect(legend.getByText('Other data').parentElement).toHaveTextContent('Other data58 GiB');
    expect(legend.getByText('Free').parentElement).toHaveTextContent('Free40 GiB');
    expect(screen.getByText('Limit 50 GiB')).toBeInTheDocument();
    expect(screen.getByText(/counts 3 GiB against its 50 GiB limit/)).toBeInTheDocument();
    expect(
      screen.getByText(/Local only means it is complete and will never be loaded by its torrent/)
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
    const legend = within(screen.getByRole('list', { name: 'Space by kind' }));
    expect(legend.getByText('Movies').parentElement).toHaveTextContent('Movies1.5 GiB');
    expect(legend.getByText('TV remuxes').parentElement).toHaveTextContent('TV remuxes512 MiB');
    expect(legend.getByText('Anime').parentElement).toHaveTextContent('Anime1 GiB');
    expect(screen.getByText('S01E03 · The Third')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Free space used by Example Anime (S01E03 · The Third)' })
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

  it('spans the limit when the disk size is unknown', () => {
    storageApi.data!.summary.filesystem = null;
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Storage usage' })).toBeInTheDocument();
    const legend = within(screen.getByRole('list', { name: 'Space by kind' }));
    expect(legend.queryByText('Other data')).not.toBeInTheDocument();
    expect(legend.queryByText('Free')).not.toBeInTheDocument();
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
    expect(screen.getByText('No downloaded content is using storage.')).toBeInTheDocument();
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
    expect(screen.getByRole('alert')).toHaveTextContent('Showing the last loaded results');
    expect(screen.getByText('Example Film')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(storageApi.refetch).toHaveBeenCalled();
  });

  it('lets the admin cancel a removal without calling the API', () => {
    render(<StoragePage onDismiss={vi.fn()} />);
    const free = screen.getByRole('button', { name: 'Free space used by Example Film' });
    pointerPress(free);
    const dialog = screen.getByRole('dialog', { name: 'Free space used by Example Film?' });
    expect(dialog).toHaveAccessibleDescription(/This deletes 2 GiB from this server/);
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
    fireEvent.click(screen.getByRole('button', { name: 'Free space used by Example Film' }));
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
    pointerPress(screen.getByRole('button', { name: 'Free space used by Example Film' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete download' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(storageApi.removeStorage).toHaveBeenCalledWith(7);
    expect(storageApi.refetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Freed .* used by Example Film/)).toBeInTheDocument();
    expect(focused()).toBe(screen.getByRole('button', { name: 'Free space used by Example Film' }));
  });

  it('prevents removing a download while it is being watched', () => {
    storageApi.data!.items[0] = { ...baseItem, activeStreams: 1 };
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByText(/Currently being watched/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Free space used by Example Film' })).toBeDisabled();
  });

  it('keeps the confirmation open and explains an API deletion failure', async () => {
    storageApi.removeStorage.mockImplementation(() => ({
      unwrap: async () => {
        throw { data: { error: 'This download is currently being watched' } };
      },
    }));
    render(<StoragePage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Free space used by Example Film' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete download' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This download is currently being watched'
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

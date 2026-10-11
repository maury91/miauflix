import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
      movieSourceId: number;
      title: string;
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
  movieSourceId: 7,
  title: 'Example Film',
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
});
afterEach(cleanup);

describe('Storage settings page', () => {
  it('shows storage totals, file details, and the retained local-only state', () => {
    render(<StoragePage onDismiss={vi.fn()} />);
    expect(screen.getByText('Physical disk usage')).toBeInTheDocument();
    expect(
      screen.getByText(/Local only means it is complete and will never be loaded by its torrent/)
    ).toBeInTheDocument();
    expect(screen.getByText('Storage budget')).toBeInTheDocument();
    expect(screen.getByText('Reserved capacity')).toBeInTheDocument();
    expect(screen.getByText('Filesystem free space')).toBeInTheDocument();
    expect(screen.getByText('Example Film')).toBeInTheDocument();
    expect(screen.getByText(/example\.mkv · 1080p/)).toBeInTheDocument();
    expect(screen.getAllByText('2 GiB').length).toBeGreaterThan(0);
    expect(screen.getByText(/Local only · Video complete/)).toBeInTheDocument();
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
    expect(screen.getAllByText('953.7 MiB').length).toBeGreaterThan(0);
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
    fireEvent.click(screen.getByRole('button', { name: 'Free space used by Example Film' }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    const confirm = screen.getByRole('button', { name: 'Delete download' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(storageApi.removeStorage).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Free space used by Example Film' })).toHaveFocus();
  });

  it('frees a selected item, announces success, refreshes, and restores focus', async () => {
    storageApi.removeStorage.mockImplementation(() => ({
      unwrap: async () => ({ success: true }),
    }));
    render(<StoragePage onDismiss={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Free space used by Example Film' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete download' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(storageApi.removeStorage).toHaveBeenCalledWith(7);
    expect(storageApi.refetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Freed .* used by Example Film/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Free space used by Example Film' })).toHaveFocus();
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
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

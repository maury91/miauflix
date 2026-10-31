import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/connect', () => ({ connectTvServer: vi.fn() }));
vi.mock('../lib/probe', () => ({ probeServer: vi.fn() }));
vi.mock('../lib/scan', () => ({ getTvIpAddress: vi.fn(), scanSubnet: vi.fn() }));
vi.mock('../lib/lookup', () => ({ lookupAnnouncedServers: vi.fn() }));

import { connectTvServer } from '../lib/connect';
import { lookupAnnouncedServers } from '../lib/lookup';
import { probeServer } from '../lib/probe';
import { getTvIpAddress, scanSubnet } from '../lib/scan';
import { ServerPicker } from './ServerPicker';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(lookupAnnouncedServers).mockResolvedValue([]);
  vi.mocked(getTvIpAddress).mockResolvedValue('192.168.1.50');
  vi.mocked(scanSubnet).mockResolvedValue([]);
  vi.mocked(probeServer).mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('ServerPicker', () => {
  it('lists the announced servers of its network that answer', async () => {
    vi.mocked(lookupAnnouncedServers).mockResolvedValue([
      {
        id: 'server-one',
        urls: ['http://172.17.0.2:3000', 'http://192.168.1.10:3000'],
        lastSeen: new Date().toISOString(),
      },
    ]);
    vi.mocked(probeServer).mockImplementation(async url => url === 'http://192.168.1.10:3000');
    render(<ServerPicker />);

    expect(await screen.findByRole('button', { name: '192.168.1.10:3000' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '172.17.0.2:3000' })).toBeNull();
    expect(lookupAnnouncedServers).toHaveBeenCalledWith('https://pair.miauflix.cat');
  });

  it('lists the servers the scan finds', async () => {
    vi.mocked(scanSubnet).mockImplementation(async (_ip, options) => {
      options?.onFound?.('http://192.168.1.10:3000');
      return ['http://192.168.1.10:3000'];
    });
    render(<ServerPicker />);

    const server = await screen.findByRole('button', { name: '192.168.1.10:3000' });
    await waitFor(() => expect(document.activeElement).toBe(server));
    fireEvent.click(server);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(connectTvServer).toHaveBeenCalledWith('http://192.168.1.10:3000');
  });

  it('connects to a typed address once it answers', async () => {
    vi.mocked(probeServer).mockResolvedValueOnce(false);
    render(<ServerPicker />);
    const input = screen.getByLabelText('Or type its address');

    fireEvent.change(input, { target: { value: '192.168.1.20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(await screen.findByText('No Miauflix server answers at 192.168.1.20:3000')).toBeTruthy();
    expect(connectTvServer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(connectTvServer).toHaveBeenCalledWith('http://192.168.1.20:3000');
  });

  it('reconnects to the last server when it is back', async () => {
    vi.mocked(probeServer).mockResolvedValue(true);
    render(<ServerPicker lastServer="http://192.168.1.10:3000" />);

    expect(screen.getByText(/192\.168\.1\.10:3000 doesn't answer/)).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(connectTvServer).toHaveBeenCalledWith('http://192.168.1.10:3000');
  });

  it('moves through every control with the remote, keeping the focus while busy', async () => {
    vi.mocked(scanSubnet).mockImplementation(async (_ip, options) => {
      options?.onFound?.('http://192.168.1.10:3000');
      return ['http://192.168.1.10:3000'];
    });
    render(<ServerPicker />);
    const server = await screen.findByRole('button', { name: '192.168.1.10:3000' });
    await waitFor(() => expect(document.activeElement).toBe(server));
    const search = screen.getByRole('button', { name: 'Search again' });
    const input = screen.getByLabelText('Or type its address');
    const connect = screen.getByRole('button', { name: 'Connect' });

    const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key });
    press('ArrowDown');
    expect(document.activeElement).toBe(search);
    press('ArrowDown');
    expect(document.activeElement).toBe(input);
    press('ArrowDown');
    expect(document.activeElement).toBe(connect);
    press('ArrowLeft');
    expect(document.activeElement).toBe(input);
    // Left and Right inside the field move the caret
    press('ArrowRight');
    expect(document.activeElement).toBe(input);
    press('ArrowUp');
    press('ArrowUp');
    expect(document.activeElement).toBe(server);

    // A new search keeps the focus on its button
    press('ArrowDown');
    fireEvent.click(search);
    expect(document.activeElement).toBe(search);
  });

  it('takes the focus back when a remote key finds nothing focused', async () => {
    render(<ServerPicker />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    (document.activeElement as HTMLElement).blur();

    fireEvent.keyDown(document.body, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByLabelText('Or type its address'));
  });
});

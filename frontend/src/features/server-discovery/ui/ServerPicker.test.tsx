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
  // jsdom lays nothing out; the navigation layer only focuses elements on screen
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const press = (key: string) => fireEvent.keyDown(document.activeElement ?? document.body, { key });
/** Virtual focus: the element, or the field frame around it, shows it. */
const focused = (element: HTMLElement) => element.closest('[data-focused]') !== null;

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
    await waitFor(() => expect(focused(server)).toBe(true));
    fireEvent.click(server);
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(connectTvServer).toHaveBeenCalledWith('http://192.168.1.10:3000');
  });

  it('connects to a typed address once it answers', async () => {
    vi.mocked(probeServer).mockResolvedValueOnce(false);
    render(<ServerPicker />);
    const input = screen.getByLabelText('Or enter the server address');

    fireEvent.change(input, { target: { value: '192.168.1.20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    expect(
      await screen.findByText(
        'No Miauflix server responded at 192.168.1.20:3000. Check the address and try again.'
      )
    ).toBeTruthy();
    expect(connectTvServer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(connectTvServer).toHaveBeenCalledWith('http://192.168.1.20:3000');
  });

  it('reconnects to the last server when it is back', async () => {
    vi.mocked(probeServer).mockResolvedValue(true);
    render(<ServerPicker lastServer="http://192.168.1.10:3000" />);

    expect(screen.getByText(/192\.168\.1\.10:3000 isn't responding/)).toBeTruthy();
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
    await waitFor(() => expect(focused(server)).toBe(true));
    const search = screen.getByRole('button', { name: /Search again|Searching/ });
    const input = screen.getByLabelText('Or enter the server address');
    const connect = screen.getByRole('button', { name: 'Connect' });

    press('ArrowDown');
    expect(focused(search)).toBe(true);
    press('ArrowDown');
    expect(focused(input)).toBe(true);
    press('ArrowDown');
    expect(focused(connect)).toBe(true);
    press('ArrowUp');
    expect(focused(input)).toBe(true);
    press('ArrowUp');
    press('ArrowUp');
    expect(focused(server)).toBe(true);

    // A new search keeps the focus on its button
    press('ArrowDown');
    fireEvent.click(search);
    expect(focused(search)).toBe(true);
  });

  it('starts on the address when no server is found', async () => {
    render(<ServerPicker />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(focused(screen.getByLabelText('Or enter the server address'))).toBe(true);
  });
});

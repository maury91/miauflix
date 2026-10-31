import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/connect', () => ({ connectTvServer: vi.fn() }));
vi.mock('../lib/probe', () => ({ probeServer: vi.fn() }));
vi.mock('../lib/scan', () => ({ getTvIpAddress: vi.fn(), scanSubnet: vi.fn() }));
vi.mock('../lib/pairing', () => ({ createTvPairing: vi.fn(), pollTvPairing: vi.fn() }));

import { connectTvServer } from '../lib/connect';
import { createTvPairing, pollTvPairing } from '../lib/pairing';
import { probeServer } from '../lib/probe';
import { getTvIpAddress, scanSubnet } from '../lib/scan';
import { ServerPicker } from './ServerPicker';

const pairing = {
  code: 'ABCDEFGH',
  secret: 'secret',
  expiresAt: new Date(Date.now() + 600_000).toISOString(),
  pollInterval: 3,
};

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(createTvPairing).mockResolvedValue(pairing);
  vi.mocked(pollTvPairing).mockResolvedValue({ status: 'pending' });
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
  it('shows a pairing code and connects to the address someone entered for it', async () => {
    vi.mocked(pollTvPairing).mockResolvedValue({
      status: 'paired',
      server: { url: 'http://192.168.1.10:3000' },
    });
    render(<ServerPicker />);

    expect(await screen.findByText('ABCD EFGH')).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(3000));

    expect(probeServer).toHaveBeenCalledWith('http://192.168.1.10:3000');
    expect(connectTvServer).toHaveBeenCalledWith('http://192.168.1.10:3000');
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

  it('moves between controls with Up and Down', async () => {
    render(<ServerPicker />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    const input = screen.getByLabelText('Or type its address');
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Search again' }));
  });
});

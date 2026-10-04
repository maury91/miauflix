import type { ProviderAuthorization } from '@miauflix/service-contracts';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { pollAuthorization } = vi.hoisted(() => ({ pollAuthorization: vi.fn() }));
vi.mock('@features/integrations/api/trakt.api', () => ({
  pollTraktAssociation: pollAuthorization,
}));

import { useTraktAuthorizationPolling } from './useTraktAuthorizationPolling';

const setupTest = () => {
  const onConnected = vi.fn();
  const onError = vi.fn();
  const authorization = {
    authorizationId: 'device-id',
    interval: 2,
  } as ProviderAuthorization;
  const view = renderHook(() =>
    useTraktAuthorizationPolling({
      authorization,
      sessionId: 'test-session',
      onConnected,
      onError,
    })
  );
  return { ...view, onConnected, onError };
};

describe('Trakt authorization polling', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('waits for the provider interval and repeats pending polls', async () => {
    pollAuthorization.mockResolvedValue({ data: { state: 'pending' } });
    const { unmount } = setupTest();
    await act(() => vi.advanceTimersByTimeAsync(4999));
    expect(pollAuthorization).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(5001));
    expect(pollAuthorization).toHaveBeenCalledTimes(2);
    expect(pollAuthorization).toHaveBeenLastCalledWith('device-id', 'test-session');
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(4000));
    expect(pollAuthorization).toHaveBeenCalledTimes(2);
  });

  it('ignores an in-flight response after unmount', async () => {
    let resolve!: (value: unknown) => void;
    pollAuthorization.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    const { unmount, onConnected, onError } = setupTest();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    unmount();
    await act(async () => {
      resolve({ data: { state: 'connected' } });
    });
    expect(onConnected).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('reports expiration and stops polling', async () => {
    pollAuthorization.mockResolvedValue({ data: { state: 'expired' } });
    const { unmount, onError } = setupTest();
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(onError).toHaveBeenLastCalledWith('The Trakt authorization expired. Try again.');
    expect(pollAuthorization).toHaveBeenCalledTimes(1);
    unmount();
  });
  it('backs off repeated 429 responses and clears the error after success', async () => {
    pollAuthorization
      .mockResolvedValueOnce({ error: { status: 429, data: 'Too Many Requests' } })
      .mockResolvedValueOnce({ error: { status: 429, data: 'Too Many Requests' } })
      .mockResolvedValue({ data: { state: 'pending' } });
    const { unmount, onError } = setupTest();
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(onError).toHaveBeenLastCalledWith('Too Many Requests');
    await act(() => vi.advanceTimersByTimeAsync(9999));
    expect(pollAuthorization).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(pollAuthorization).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(19999));
    expect(pollAuthorization).toHaveBeenCalledTimes(2);
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(onError).toHaveBeenLastCalledWith(null);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(pollAuthorization).toHaveBeenCalledTimes(4);
    unmount();
  });

  it('does not restart an in-flight poll when callbacks change', async () => {
    let resolve!: (value: unknown) => void;
    pollAuthorization.mockReturnValue(
      new Promise(done => {
        resolve = done;
      })
    );
    const authorization = { authorizationId: 'device-id', interval: 2 } as ProviderAuthorization;
    const firstCallback = vi.fn();
    const nextCallback = vi.fn();
    const onError = vi.fn();
    const { rerender, unmount } = renderHook(
      ({ onConnected }) =>
        useTraktAuthorizationPolling({ authorization, sessionId: 'session', onConnected, onError }),
      { initialProps: { onConnected: firstCallback } }
    );
    await act(() => vi.advanceTimersByTimeAsync(5000));
    rerender({ onConnected: nextCallback });
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(pollAuthorization).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve({ data: { state: 'connected' } });
    });
    expect(firstCallback).not.toHaveBeenCalled();
    expect(nextCallback).toHaveBeenCalledTimes(1);
    unmount();
  });
});

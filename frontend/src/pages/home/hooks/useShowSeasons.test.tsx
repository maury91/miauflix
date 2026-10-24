import { mediaApi } from '@features/media/api/media.api';
import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Responses per "showId:season"; a missing entry fails the request. */
const { responses, requests } = vi.hoisted(() => ({
  responses: new Map<string, unknown>(),
  requests: [] as string[],
}));
vi.mock('@shared/api/authenticated-request', () => ({
  authenticatedRequest: ({ requestFn }: { requestFn: () => Promise<unknown> }) => requestFn(),
}));
vi.mock('@shared/api/backend-client', () => ({
  backendClient: {
    api: {
      shows: {
        ':id': {
          seasons: {
            ':season': {
              $get: async ({ param }: { param: { id: string; season: string } }) => {
                const key = `${param.id}:${param.season}`;
                requests.push(key);
                return responses.has(key)
                  ? { data: responses.get(key) }
                  : { error: { status: 500, data: 'unavailable' } };
              },
            },
          },
        },
      },
    },
  },
}));

import { useShowSeasons } from './useShowSeasons';

const season = (seasonNumber: number) => ({
  id: seasonNumber,
  seasonNumber,
  name: `Season ${seasonNumber}`,
  overview: null,
  airDate: null,
  poster: null,
  episodes: [],
});

const setup = (initialProps: Parameters<typeof useShowSeasons>[0]) => {
  const store = configureStore({
    reducer: { [mediaApi.reducerPath]: mediaApi.reducer, auth: authSlice.reducer },
    middleware: getDefault => getDefault().concat(mediaApi.middleware),
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  return renderHook(props => useShowSeasons(props), { wrapper, initialProps });
};

describe('useShowSeasons', () => {
  beforeEach(() => {
    responses.clear();
    requests.length = 0;
    for (const number of [1, 2, 3]) responses.set(`7:${number}`, season(number));
  });

  it('loads the opening season and reports loading until it arrives', async () => {
    const { result } = setup({ showId: 7, seasonNumbers: [1, 2, 3], openingSeason: 2 });
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.loadedSections.map(s => s.seasonNumber)).toEqual([2]);
    expect(requests).toEqual(['7:2']);
  });

  it('keeps requested seasons, in display order, and fetches each once', async () => {
    const { result } = setup({ showId: 7, seasonNumbers: [1, 2, 3], openingSeason: 2 });
    act(() => {
      result.current.request(3);
      result.current.request(1);
      result.current.request(3);
    });
    await waitFor(() => expect(result.current.loadedSections).toHaveLength(3));
    expect(result.current.loadedSections.map(s => s.seasonNumber)).toEqual([1, 2, 3]);
    expect([...requests].sort()).toEqual(['7:1', '7:2', '7:3']);
  });

  it('reports a failed season until a retry succeeds', async () => {
    responses.delete('7:3');
    const { result } = setup({ showId: 7, seasonNumbers: [1, 2, 3], openingSeason: 1 });
    act(() => result.current.request(3));
    await waitFor(() => expect(result.current.failedSeasons).toEqual([3]));
    expect(result.current.loading).toBe(false);

    responses.set('7:3', season(3));
    act(() => result.current.retry(3));
    // While retrying it is loading again, not failed.
    expect(result.current.failedSeasons).toEqual([]);
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loaded[3]?.name).toBe('Season 3'));
    expect(result.current.loading).toBe(false);
  });

  it('starts with nothing requested for another show', async () => {
    responses.set('8:1', season(1));
    const { result, rerender } = setup({ showId: 7, seasonNumbers: [1, 2, 3], openingSeason: 1 });
    act(() => result.current.request(3));
    await waitFor(() => expect(result.current.loadedSections).toHaveLength(2));

    rerender({ showId: 8, seasonNumbers: [1, 2, 3], openingSeason: 1 });
    await waitFor(() => expect(result.current.loadedSections).toHaveLength(1));
    expect(requests).not.toContain('8:3');
  });

  it('does nothing without a show', () => {
    const { result } = setup({ showId: null, seasonNumbers: [], openingSeason: undefined });
    expect(result.current).toMatchObject({ loadedSections: [], loading: false, failedSeasons: [] });
    expect(requests).toEqual([]);
  });
});

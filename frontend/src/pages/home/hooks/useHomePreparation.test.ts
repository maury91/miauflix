import type {
  MediaDto,
  PreloadPreparationSnapshot,
  PreloadPreparationSource,
} from '@miauflix/backend';
import { configureStore } from '@reduxjs/toolkit';
import { realtimeActions, realtimeSlice } from '@store/slices/realtime';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@features/preload/api/preload.api', () => ({}));

import { type PreparationInputs, resolvePreparation, usePreparation } from './useHomePreparation';

const movie = { _type: 'movie', mediaId: 7 } as MediaDto;
const show = { _type: 'tvshow', mediaId: 7 } as MediaDto;
const source = { id: 1, quality: '1080p' } as unknown as PreloadPreparationSource;
const snapshot = (
  state: PreloadPreparationSnapshot['state'],
  mediaId = 7,
  extra: Partial<PreloadPreparationSnapshot> = {}
): PreloadPreparationSnapshot =>
  ({
    playable: { kind: 'movie', mediaId },
    state,
    source: null,
    warmup: { state: 'warming' },
    ...extra,
  }) as PreloadPreparationSnapshot;

describe('resolvePreparation', () => {
  it('reports nothing for shows or without a selection', () => {
    expect(
      resolvePreparation({
        selectedMedia: show,
        response: snapshot('source_found'),
        cachedSource: source,
        intentFailedForMovieId: 7,
      })
    ).toBeNull();
    expect(
      resolvePreparation({
        selectedMedia: null,
        response: undefined,
        cachedSource: undefined,
        intentFailedForMovieId: null,
      })
    ).toBeNull();
  });

  it.each<
    [string, PreloadPreparationSnapshot | undefined, boolean, number | null, string | null, string]
  >([
    ['the server answer for this movie', snapshot('no_source'), false, null, 'no_source', ''],
    [
      'nothing while the answer is for another movie',
      snapshot('no_source', 8),
      false,
      null,
      null,
      '',
    ],
    [
      'a remembered source while the server is still checking',
      snapshot('checking'),
      true,
      null,
      'source_found',
      'warming',
    ],
    [
      'a remembered source before any answer, with no live warmup',
      undefined,
      true,
      null,
      'source_found',
      'not_requested',
    ],
    ['the server answer once it is final', snapshot('no_source'), true, null, 'no_source', ''],
    ['an error when the intent for this movie failed', undefined, false, 7, 'error', ''],
    ['no error for another movie’s failed intent', undefined, false, 8, null, ''],
  ])('%s', (_name, response, cached, failedFor, expectedState, expectedWarmup) => {
    const result = resolvePreparation({
      selectedMedia: movie,
      response,
      cachedSource: cached ? source : undefined,
      intentFailedForMovieId: failedFor,
    });
    expect(result?.state ?? null).toBe(expectedState);
    if (expectedState === 'source_found') expect(result?.source).toBe(source);
    if (expectedWarmup) expect(result?.warmup.state).toBe(expectedWarmup);
  });
});

describe('usePreparation', () => {
  const sourceStatus = {
    type: 'source-status' as const,
    mediaId: 7,
    media: { kind: 'movie' as const, mediaId: 7 },
    status: 'source_found',
    sourceId: 12,
    quality: '1080p',
    source: 'torrent',
    focusSequence: 3,
  };
  const warmup = (loaded: number) => ({
    type: 'warmup' as const,
    mediaId: 7,
    media: { kind: 'movie' as const, mediaId: 7 },
    playable: { kind: 'movie' as const, mediaId: 7 },
    status: 'warming',
    loaded,
    verifiedBytes: 40,
    targetBytes: 100,
    statusDescription: 'Warming',
    focusSequence: 3,
  });

  const setup = (ignoreWarmup: boolean) => {
    const store = configureStore({ reducer: { realtime: realtimeSlice.reducer } });
    const inputs: PreparationInputs = {
      fallback: undefined,
      intentFailedForMovieId: null,
      sourceCache: new Map(),
    };
    let renders = 0;
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(Provider, { store, children });
    const hook = renderHook(
      () => {
        renders++;
        return usePreparation(movie, inputs, { ignoreWarmup });
      },
      { wrapper }
    );
    act(() => {
      store.dispatch(realtimeActions.statusReceived(sourceStatus));
    });
    return { store, hook, inputs, renders: () => renders };
  };

  it('shows pushed preparation and remembers the source found', () => {
    const { hook, inputs } = setup(false);
    expect(hook.result.current).toMatchObject({ state: 'source_found', source: { id: 12 } });
    expect(inputs.sourceCache.get(7)).toMatchObject({ id: 12, quality: '1080p' });
  });

  it('follows warmup progress unless told to ignore it', () => {
    const following = setup(false);
    act(() => {
      following.store.dispatch(realtimeActions.statusReceived(warmup(50)));
    });
    expect(following.hook.result.current?.warmup.progress).toBe(50);

    const ignoring = setup(true);
    const before = ignoring.renders();
    act(() => {
      ignoring.store.dispatch(realtimeActions.statusReceived(warmup(50)));
      ignoring.store.dispatch(realtimeActions.statusReceived(warmup(60)));
    });
    expect(ignoring.renders()).toBe(before);

    act(() => {
      ignoring.store.dispatch(
        realtimeActions.statusReceived({ ...sourceStatus, status: 'no_source', sourceId: null })
      );
    });
    expect(ignoring.hook.result.current?.state).toBe('no_source');
  });
});

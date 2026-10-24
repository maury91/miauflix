import type {
  MediaDto,
  PreloadPreparationSnapshot,
  PreloadPreparationSource,
} from '@miauflix/backend';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@features/preload/api/preload.api', () => ({}));

import { resolvePreparation } from './useHomePreparation';

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

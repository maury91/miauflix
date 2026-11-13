import {
  playableFromKey,
  playableKey,
  playableRefSchema,
  preloadIntentRequestSchema,
} from './playable.types';

describe('playable references', () => {
  it.each([
    { kind: 'movie' as const, mediaId: 42 },
    { kind: 'episode' as const, showMediaId: 7, seasonNumber: 0, episodeNumber: 3 },
  ])('round-trips $kind storage keys', ref => {
    expect(playableFromKey(playableKey(ref))).toEqual(ref);
  });

  it('rejects malformed keys and invalid references', () => {
    expect(playableFromKey('m:0')).toBeNull();
    expect(playableFromKey('e:7:1')).toBeNull();
    expect(playableRefSchema.safeParse({ kind: 'movie', mediaId: 1, sourceId: 5 }).success).toBe(
      false
    );
  });

  it('bounds and rejects untrusted intent fields', () => {
    const valid = {
      sequence: 1,
      view: 'browse' as const,
      focused: { kind: 'movie' as const, mediaId: 42 },
      reachable: [],
    };
    expect(preloadIntentRequestSchema.safeParse(valid).success).toBe(true);
    expect(preloadIntentRequestSchema.safeParse({ ...valid, priority: 1 }).success).toBe(false);
    expect(
      preloadIntentRequestSchema.safeParse({
        ...valid,
        reachable: Array.from({ length: 9 }, () => ({
          target: valid.focused,
          distance: 1,
          direction: 'right',
        })),
      }).success
    ).toBe(false);
  });
});

import type { Database } from '@database/database';

import { PlaybackSessionService } from './playback-session.service';

describe('PlaybackSessionService', () => {
  it('creates a grant for a valid magnet-only source after preparation', async () => {
    const source = {
      id: 208,
      file: undefined,
      quality: null,
      size: 1_000,
      videoCodec: null,
      broadcasters: 1,
      watchers: 2,
    };
    const grants = { create: jest.fn(), findActiveByHash: jest.fn() };
    const preparation = {
      prepare: jest.fn().mockResolvedValue({
        playable: { kind: 'movie', mediaId: 42 },
        source,
        state: 'warming',
      }),
    };
    const warmup = { promote: jest.fn().mockResolvedValue(true) };
    const storageService = { getStorageByMovieSource: jest.fn().mockResolvedValue(null) };
    const database = {
      getPlaybackGrantRepository: jest.fn().mockReturnValue(grants),
    } as unknown as Database;
    const config = { getOrThrow: jest.fn().mockReturnValue(60_000) };
    const service = new PlaybackSessionService(
      database,
      preparation as never,
      config as never,
      warmup as never,
      storageService as never
    );

    const session = await service.create(
      'user-1',
      { kind: 'movie', mediaId: 42 },
      { quality: 'auto', allowHevc: true }
    );

    expect(session).toMatchObject({ source: { id: 208 }, preparation: { state: 'warming' } });
    expect(warmup.promote).toHaveBeenCalledWith(source, 'm:42');
    expect(grants.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 208, playableKey: 'm:42' })
    );
  });
});

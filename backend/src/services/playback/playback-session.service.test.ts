import { VideoCodec } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';

import { AudioConversionRequiredError, AudioPlaybackError } from './audio-playback.service';
import { PlaybackSessionService } from './playback-session.service';

const movie = <T>(source: T) => ({ source, filePath: 'movie.mkv', matchKind: 'movie' as const });

describe('PlaybackSessionService', () => {
  it.each([new AudioPlaybackError('busy'), new AudioPlaybackError('duration missing', 422)])(
    'keeps direct playback available on inspection failure: %s',
    async error => {
      const grants = { create: jest.fn() };
      const service = new PlaybackSessionService(
        { getPlaybackGrantRepository: () => grants } as never,
        {
          prepare: async () => ({ source: { id: 1 }, target: movie({ id: 1 }), state: 'cold' }),
        } as never,
        { getOrThrow: () => 60000 } as never,
        undefined,
        undefined,
        { inspect: jest.fn().mockRejectedValue(error) } as never
      );
      const session = await service.create(
        'user',
        { kind: 'movie', mediaId: 1 },
        { quality: 'auto', allowHevc: false }
      );
      expect(session?.streamUrl).not.toContain('/audio');
      expect(grants.create).toHaveBeenCalled();
    }
  );

  it('falls back to H.264 when HEVC audio cannot be converted, granting only the usable copy', async () => {
    const hevc = { id: 1, videoCodec: VideoCodec.X265 };
    const h264 = { id: 2, videoCodec: VideoCodec.X264 };
    const grants = { create: jest.fn() };
    const preparation = {
      prepare: jest
        .fn()
        .mockResolvedValueOnce({ source: hevc, target: movie(hevc), state: 'ready' })
        .mockResolvedValueOnce({ source: h264, target: movie(h264), state: 'ready' }),
    };
    const audio = {
      inspect: jest
        .fn()
        .mockRejectedValueOnce(
          new AudioConversionRequiredError('Audio conversion requires an H.264 video source.')
        )
        .mockResolvedValueOnce({ mode: 'direct' }),
    };
    const warmup = { promote: jest.fn() };
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => grants } as never,
      preparation as never,
      { getOrThrow: () => 60000 } as never,
      warmup as never,
      undefined,
      audio as never
    );
    const result = await service.create(
      'user',
      { kind: 'movie', mediaId: 42 },
      {
        quality: 'auto',
        allowHevc: true,
      }
    );
    expect(result?.source.id).toBe(2);
    expect(preparation.prepare.mock.calls[1][1].preferences.allowHevc).toBe(false);
    expect(audio.inspect).toHaveBeenNthCalledWith(2, movie(h264), expect.anything());
    expect(warmup.promote).toHaveBeenLastCalledWith(movie(h264), 'm:42', 'user:user:m:42');
    expect(grants.create).toHaveBeenCalledTimes(1);
    expect(grants.create).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 2 }));
  });

  it.each([true, false])(
    'allows HEVC selection for configured conversion or MSE decoding (convert=%s)',
    async convert => {
      const grants = { create: jest.fn() };
      const preparation = {
        prepare: jest.fn().mockResolvedValue({
          source: { id: 1, videoCodec: VideoCodec.X265 },
          target: movie({ id: 1, videoCodec: VideoCodec.X265 }),
          state: 'cold',
        }),
      };
      const audio = {
        canConvertHevc: () => convert,
        inspect: jest.fn().mockResolvedValue({ mode: 'audio-transcode' }),
      };
      const service = new PlaybackSessionService(
        { getPlaybackGrantRepository: () => grants } as never,
        preparation as never,
        { getOrThrow: () => 60000 } as never,
        undefined,
        undefined,
        audio as never
      );
      await service.create(
        'user',
        { kind: 'movie', mediaId: 1 },
        {
          quality: 'auto',
          allowHevc: false,
          supportedMseVideoCodecs: convert ? ['h264'] : ['hevc'],
        }
      );
      expect(preparation.prepare.mock.calls[0][1].preferences.allowHevc).toBe(true);
      expect(audio.inspect.mock.calls[0][1].allowHevc).toBe(false);
    }
  );

  it('preserves a known conversion failure without issuing a grant', async () => {
    const grants = { create: jest.fn() };
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => grants } as never,
      {
        prepare: async () => ({ source: { id: 1 }, target: movie({ id: 1 }), state: 'cold' }),
      } as never,
      { getOrThrow: () => 60000 } as never,
      undefined,
      undefined,
      {
        inspect: jest.fn().mockRejectedValue(new AudioConversionRequiredError('unsupported video')),
      } as never
    );
    await expect(
      service.create('user', { kind: 'movie', mediaId: 1 }, { quality: 'auto', allowHevc: false })
    ).rejects.toThrow('unsupported video');
    expect(grants.create).not.toHaveBeenCalled();
  });

  it('discovers a next episode without starting its download', async () => {
    const source = {
      id: 31,
      quality: null,
      size: 1_000,
      videoCodec: null,
      broadcasters: null,
      watchers: null,
    };
    const grants = { create: jest.fn() };
    const preparation = {
      prepare: jest.fn().mockResolvedValue({
        source,
        target: { source, filePath: 'Show.S01E02.mkv', matchKind: 'single' },
        state: 'metadata',
      }),
    };
    const warmup = { promote: jest.fn() };
    const audio = { inspect: jest.fn() };
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => grants } as never,
      preparation as never,
      { getOrThrow: () => 60_000 } as never,
      warmup as never,
      undefined,
      audio as never
    );
    const playable = {
      kind: 'episode' as const,
      showMediaId: 42,
      seasonNumber: 1,
      episodeNumber: 2,
    };

    const result = await service.create(
      'user',
      playable,
      { quality: 'auto', allowHevc: false },
      { deferDownload: true }
    );

    expect(preparation.prepare).toHaveBeenCalledWith(
      playable,
      expect.objectContaining({ through: 'sources' })
    );
    expect(warmup.promote).not.toHaveBeenCalled();
    expect(audio.inspect).not.toHaveBeenCalled();
    expect(grants.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: source.id, playableKey: 'e:42:1:2' })
    );
    expect(result).toMatchObject({ source: { id: source.id }, episodeMatchKind: 'single' });
  });

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
        target: movie(source),
        state: 'warming',
      }),
    };
    const warmup = { promote: jest.fn().mockResolvedValue(true) };
    const storageService = { getStorageBySource: jest.fn().mockResolvedValue(null) };
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
    expect(warmup.promote).toHaveBeenCalledWith(movie(source), 'm:42', 'user:user-1:m:42');
    expect(grants.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 208, playableKey: 'm:42' })
    );
  });

  it('grants a movie whose file is not resolved yet without inspecting it', async () => {
    const grants = { create: jest.fn() };
    const audio = { inspect: jest.fn() };
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => grants } as never,
      { prepare: async () => ({ source: { id: 3 }, target: null, state: 'cold' }) } as never,
      { getOrThrow: () => 60000 } as never,
      undefined,
      undefined,
      audio as never
    );

    const session = await service.create(
      'user',
      { kind: 'movie', mediaId: 1 },
      { quality: 'auto', allowHevc: false }
    );

    expect(audio.inspect).not.toHaveBeenCalled();
    expect(session?.delivery).toBeUndefined();
    expect(grants.create).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 3 }));
  });
});

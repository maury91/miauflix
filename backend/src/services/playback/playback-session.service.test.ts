import { VideoCodec } from '@miauflix/source-metadata-extractor';

import type { Database } from '@database/database';

import { AudioConversionRequiredError, AudioPlaybackError } from './audio-playback.service';
import { PlaybackSessionService, PlaybackUnavailableError } from './playback-session.service';

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
        {
          knownDelivery: jest.fn().mockResolvedValue(null),
          inspect: jest.fn().mockRejectedValue(error),
        } as never
      );
      const listener = jest.fn();
      service.onDeliveryUpdate(listener);
      const session = await service.create(
        'user',
        { kind: 'movie', mediaId: 1 },
        { quality: 'auto', allowHevc: false }
      );
      await new Promise(resolve => setImmediate(resolve));
      expect(session?.streamUrl).not.toContain('/audio');
      expect(session?.deliveryPending).toBe(true);
      expect(grants.create).toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();
    }
  );

  it('shares each candidate it tries with the viewer and returns the one it plays', async () => {
    type Attempt = { sourceId: number; position: number; total: number };
    const prepare = jest.fn(
      async (_playable: unknown, options: { onSourceAttempt: (attempt: Attempt) => void }) => {
        options.onSourceAttempt({ sourceId: 1, position: 1, total: 3 });
        options.onSourceAttempt({ sourceId: 2, position: 2, total: 3 });
        return { source: { id: 2 }, target: movie({ id: 2 }), state: 'cold' };
      }
    );
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      { prepare } as never,
      { getOrThrow: () => 60000 } as never,
      undefined,
      undefined,
      { knownDelivery: jest.fn().mockResolvedValue({ mode: 'direct' }) } as never
    );
    const attempts = jest.fn();
    service.onSourceAttempt(attempts);

    const session = await service.create(
      'user',
      { kind: 'movie', mediaId: 1 },
      { quality: 'auto', allowHevc: false },
      { sessionId: 'tab' }
    );

    expect(attempts.mock.calls.map(([event]) => event.attempt.position)).toEqual([1, 2]);
    expect(attempts).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user',
        sessionId: 'tab',
        playable: { kind: 'movie', mediaId: 1 },
      })
    );
    expect(session?.sourceAttempt).toEqual({ position: 2, total: 3 });
  });

  it('reports exhaustion when every source proved fake', async () => {
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      {
        prepare: async () => ({ source: null, target: null, state: 'cold', exhausted: true }),
      } as never,
      { getOrThrow: () => 60000 } as never
    );

    await expect(
      service.create('user', { kind: 'movie', mediaId: 1 }, { quality: 'auto', allowHevc: false })
    ).rejects.toEqual(new PlaybackUnavailableError('exhausted'));
  });

  it('leaves out the sources the player already failed to play', async () => {
    const prepare = jest.fn(async () => ({
      source: { id: 2 },
      target: movie({ id: 2 }),
      state: 'cold',
    }));
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      { prepare } as never,
      { getOrThrow: () => 60000 } as never,
      undefined,
      undefined,
      { knownDelivery: jest.fn().mockResolvedValue({ mode: 'direct' }) } as never
    );

    await service.create(
      'user',
      { kind: 'movie', mediaId: 1 },
      { quality: 'auto', allowHevc: false },
      { avoidSourceIds: [1] }
    );

    expect(prepare).toHaveBeenCalledWith(
      { kind: 'movie', mediaId: 1 },
      expect.objectContaining({ avoidSourceIds: [1] })
    );
  });

  it('warms the file where the viewer will resume', async () => {
    const prepare = jest.fn(async () => ({
      source: { id: 1 },
      target: movie({ id: 1 }),
      state: 'cold',
    }));
    const progress = {
      findByKey: jest.fn().mockResolvedValue({
        positionSeconds: 1_800,
        durationSeconds: 7_200,
        state: 'paused',
      }),
    };
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      { prepare } as never,
      { getOrThrow: () => 60000 } as never,
      undefined,
      undefined,
      { knownDelivery: jest.fn().mockResolvedValue({ mode: 'direct' }) } as never,
      undefined,
      undefined,
      progress
    );

    await service.create(
      'user',
      { kind: 'movie', mediaId: 1 },
      { quality: 'auto', allowHevc: false }
    );

    expect(progress.findByKey).toHaveBeenCalledWith('user', 'm:1');
    expect(prepare).toHaveBeenCalledWith(
      { kind: 'movie', mediaId: 1 },
      expect.objectContaining({ through: 'warm', resumeFraction: 0.25 })
    );
  });

  it('streams an unprobed file directly and pushes the delivery its background probe finds', async () => {
    const grants = { create: jest.fn() };
    const audio = {
      knownDelivery: jest.fn().mockResolvedValue(null),
      inspect: jest.fn().mockResolvedValue({ mode: 'audio-transcode', durationSeconds: 60 }),
    };
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => grants } as never,
      {
        prepare: async () => ({ source: { id: 1 }, target: movie({ id: 1 }), state: 'cold' }),
      } as never,
      { getOrThrow: () => 60000 } as never,
      undefined,
      undefined,
      audio as never
    );
    const listener = jest.fn();
    service.onDeliveryUpdate(listener);
    const session = await service.create(
      'user',
      { kind: 'movie', mediaId: 1 },
      { quality: 'auto', allowHevc: false },
      { sessionId: 'session' }
    );
    expect(session).toMatchObject({ deliveryPending: true, delivery: undefined });
    expect(session?.streamUrl).toBe(`/api/stream/${session?.streamingKey}`);
    await new Promise(resolve => setImmediate(resolve));
    expect(audio.inspect).toHaveBeenCalledWith(movie({ id: 1 }), expect.anything());
    expect(listener).toHaveBeenCalledWith({
      userId: 'user',
      sessionId: 'session',
      playbackId: session?.playbackId,
      update: {
        type: 'delivery',
        delivery: { mode: 'audio-transcode', durationSeconds: 60 },
        streamUrl: `/api/stream/${session?.streamingKey}/audio`,
      },
    });
  });

  it('moves live sessions off a source that stalls, and only those sessions', async () => {
    let stalled: ((sourceId: number) => void) | undefined;
    let sourceId = 1;
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      {
        prepare: async () => ({
          source: { id: sourceId },
          target: movie({ id: sourceId }),
          state: 'ready',
        }),
      } as never,
      { getOrThrow: () => 60000 } as never,
      undefined,
      undefined,
      { knownDelivery: jest.fn().mockResolvedValue({ mode: 'direct' }) } as never,
      { onFailed: listener => ((stalled = listener), () => undefined), markFailed: jest.fn() }
    );
    const listener = jest.fn();
    service.onDeliveryUpdate(listener);
    const preferences = { quality: 'auto' as const, allowHevc: false };
    const onFailed = await service.create('user', { kind: 'movie', mediaId: 1 }, preferences, {
      sessionId: 'session',
    });
    sourceId = 2;
    await service.create('user', { kind: 'movie', mediaId: 2 }, preferences);

    stalled?.(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      userId: 'user',
      sessionId: 'session',
      playbackId: onFailed?.playbackId,
      update: { type: 'recreate', reason: 'The source stopped delivering data.' },
    });
    // The session was handed off; a later stall report does not recreate it again.
    stalled?.(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  describe('source health monitor', () => {
    const setupMonitor = () => {
      jest.useFakeTimers();
      jest.setSystemTime(100_000);
      const health = {
        streaming: true,
        local: false,
        hasMetadata: true,
        peers: 2,
        downloadSpeed: 0,
        blockedSince: null as number | null,
        lastDeliveryAt: null as number | null,
        fileLength: 3_600 * 500 * 1024,
        readFraction: null as number | null,
      };
      const backup = { id: 2 };
      const preparation = {
        prepare: jest.fn(async (_playable: unknown, options: { resolveOnly?: boolean }) =>
          options.resolveOnly
            ? { source: backup, target: movie(backup), state: 'cold' }
            : { source: { id: 1 }, target: movie({ id: 1 }), state: 'ready' }
        ),
      };
      const downloads = {
        getPlaybackHealth: jest.fn(async () => ({ ...health })),
        warmSource: jest.fn().mockResolvedValue({}),
        releaseClaims: jest.fn().mockResolvedValue(undefined),
        getWarmupTargetBytes: () => 1024,
      };
      const sourceHealth = { onFailed: jest.fn(() => () => undefined), markFailed: jest.fn() };
      const playedSources = { recordPlayed: jest.fn().mockResolvedValue(undefined) };
      const service = new PlaybackSessionService(
        { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
        preparation as never,
        { getOrThrow: () => 3_600_000 } as never,
        undefined,
        undefined,
        {
          knownDelivery: jest.fn().mockResolvedValue({ mode: 'direct', durationSeconds: 3_600 }),
        } as never,
        sourceHealth,
        downloads,
        undefined,
        playedSources
      );
      const start = () =>
        service.create(
          'user',
          { kind: 'movie', mediaId: 1 },
          { quality: 'auto', allowHevc: false }
        );
      const tick = async (ms: number) => {
        jest.setSystemTime(Date.now() + ms);
        await service.checkHealth();
        await jest.advanceTimersByTimeAsync(0);
      };
      /** Stream healthily: bytes delivered past startup, no read waiting on a piece. */
      const deliver = () => {
        health.lastDeliveryAt = Date.now() + 1_000;
        health.downloadSpeed = 2 * 1024 * 1024;
        health.blockedSince = null;
      };
      return {
        service,
        health,
        preparation,
        downloads,
        sourceHealth,
        playedSources,
        start,
        tick,
        deliver,
      };
    };

    afterEach(() => jest.useRealTimers());

    it('warms a backup while a starting source is weak, avoiding the primary', async () => {
      const { preparation, downloads, sourceHealth, start, tick } = setupMonitor();
      const session = await start();
      await tick(2_000);

      expect(preparation.prepare).toHaveBeenLastCalledWith(
        { kind: 'movie', mediaId: 1 },
        expect.objectContaining({ through: 'warm', resolveOnly: true, avoidSourceIds: [1] })
      );
      expect(downloads.warmSource).toHaveBeenCalledWith(
        movie({ id: 2 }),
        1024,
        `hedge:${session?.playbackId}`,
        0
      );
      expect(sourceHealth.markFailed).not.toHaveBeenCalled();
    });

    it('warms the backup where the viewer is reading', async () => {
      const { health, downloads, start, tick } = setupMonitor();
      health.readFraction = 0.4;
      const session = await start();
      await tick(2_000);

      expect(downloads.warmSource).toHaveBeenCalledWith(
        movie({ id: 2 }),
        1024,
        `hedge:${session?.playbackId}`,
        0.4
      );
    });

    it('reports a source that stays flat after the grace period', async () => {
      const { sourceHealth, start, tick } = setupMonitor();
      await start();
      for (let second = 0; second < 9; second++) await tick(1_000);
      expect(sourceHealth.markFailed).not.toHaveBeenCalled();
      for (let second = 0; second < 3; second++) await tick(1_000);
      expect(sourceHealth.markFailed).toHaveBeenCalledWith(1);
    });

    it('releases the backup once the primary has delivered for a while', async () => {
      const { health, downloads, start, tick } = setupMonitor();
      const session = await start();
      await tick(1_000);
      expect(downloads.warmSource).toHaveBeenCalled();

      health.lastDeliveryAt = Date.now() + 1_000;
      health.downloadSpeed = 2 * 1024 * 1024;
      for (let second = 0; second < 9; second++) await tick(1_000);
      expect(downloads.releaseClaims).not.toHaveBeenCalled();
      await tick(2_000);
      expect(downloads.releaseClaims).toHaveBeenCalledWith(
        2,
        `hedge:${session?.playbackId}`,
        'warmup'
      );
    });

    it('records a source as played once it streams for minutes without starving', async () => {
      const { playedSources, start, tick, deliver } = setupMonitor();
      await start();
      deliver();
      for (let second = 0; second < 179; second++) await tick(1_000);
      expect(playedSources.recordPlayed).not.toHaveBeenCalled();
      await tick(1_000);
      expect(playedSources.recordPlayed).toHaveBeenCalledWith(1, Date.now());
      // Once per session.
      for (let second = 0; second < 300; second++) await tick(1_000);
      expect(playedSources.recordPlayed).toHaveBeenCalledTimes(1);
    });

    it('starts the count over when the stream starves', async () => {
      const { health, playedSources, start, tick, deliver } = setupMonitor();
      await start();
      deliver();
      for (let second = 0; second < 150; second++) await tick(1_000);
      health.blockedSince = Date.now();
      await tick(1_000);
      deliver();
      for (let second = 0; second < 150; second++) await tick(1_000);
      expect(playedSources.recordPlayed).not.toHaveBeenCalled();
      for (let second = 0; second < 30; second++) await tick(1_000);
      expect(playedSources.recordPlayed).toHaveBeenCalledTimes(1);
    });

    it('never records a stream that has not delivered past startup, or a local file', async () => {
      const { health, playedSources, start, tick } = setupMonitor();
      health.downloadSpeed = 2 * 1024 * 1024;
      health.peers = 50;
      health.local = true;
      await start();
      for (let second = 0; second < 200; second++) await tick(1_000);
      health.local = false;
      health.lastDeliveryAt = 0;
      for (let second = 0; second < 200; second++) await tick(1_000);
      expect(playedSources.recordPlayed).not.toHaveBeenCalled();
    });

    it('keeps playing when the played record cannot be written', async () => {
      const { playedSources, sourceHealth, start, tick, deliver } = setupMonitor();
      playedSources.recordPlayed.mockRejectedValue(new Error('database is locked'));
      await start();
      deliver();
      for (let second = 0; second < 200; second++) await tick(1_000);
      expect(playedSources.recordPlayed).toHaveBeenCalledTimes(1);
      expect(sourceHealth.markFailed).not.toHaveBeenCalled();
    });

    it('ignores sessions whose stream never opened once the file list is known', async () => {
      const { health, preparation, sourceHealth, start, tick } = setupMonitor();
      health.streaming = false;
      await start();
      for (let second = 0; second < 30; second++) await tick(1_000);
      expect(preparation.prepare).toHaveBeenCalledTimes(1);
      expect(sourceHealth.markFailed).not.toHaveBeenCalled();
    });
  });

  it('asks the client to recreate an optimistic session the browser cannot play', async () => {
    const service = new PlaybackSessionService(
      { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      {
        prepare: async () => ({ source: { id: 1 }, target: movie({ id: 1 }), state: 'cold' }),
      } as never,
      { getOrThrow: () => 60000 } as never,
      undefined,
      undefined,
      {
        knownDelivery: jest.fn().mockResolvedValue(null),
        inspect: jest.fn().mockRejectedValue(new AudioConversionRequiredError('needs H.264')),
      } as never
    );
    const listener = jest.fn();
    service.onDeliveryUpdate(listener);
    const session = await service.create(
      'user',
      { kind: 'movie', mediaId: 1 },
      { quality: 'auto', allowHevc: false }
    );
    await new Promise(resolve => setImmediate(resolve));
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        playbackId: session?.playbackId,
        update: { type: 'recreate', reason: 'needs H.264' },
      })
    );
  });

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
      knownDelivery: jest
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
    expect(audio.knownDelivery).toHaveBeenNthCalledWith(2, movie(h264), expect.anything());
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
        knownDelivery: jest.fn().mockResolvedValue({ mode: 'audio-transcode' }),
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
      expect(audio.knownDelivery.mock.calls[0][1].allowHevc).toBe(false);
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
        knownDelivery: jest
          .fn()
          .mockRejectedValue(new AudioConversionRequiredError('unsupported video')),
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

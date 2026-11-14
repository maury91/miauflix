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
      const service = new PlaybackSessionService({
        db: { getPlaybackGrantRepository: () => grants } as never,
        preparation: {
          prepare: async () => ({ source: { id: 1 }, target: movie({ id: 1 }), state: 'cold' }),
        } as never,
        config: { getOrThrow: () => 60000 } as never,
        audioPlaybackService: {
          knownDelivery: jest.fn().mockResolvedValue(null),
          inspect: jest.fn().mockRejectedValue(error),
        } as never,
      });
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

  it('inspects again while the session plays after a failed inspection', async () => {
    jest.useFakeTimers();
    const audio = {
      knownDelivery: jest.fn().mockResolvedValue(null),
      inspect: jest
        .fn()
        .mockRejectedValueOnce(new AudioPlaybackError('could not be inspected'))
        .mockResolvedValueOnce({ mode: 'audio-transcode', durationSeconds: 60 }),
    };
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      preparation: {
        prepare: async () => ({ source: { id: 1 }, target: movie({ id: 1 }), state: 'cold' }),
      } as never,
      config: { getOrThrow: () => 60000 } as never,
      audioPlaybackService: audio as never,
    });
    const listener = jest.fn();
    service.onDeliveryUpdate(listener);
    const session = await service.create(
      'user',
      { kind: 'movie', mediaId: 1 },
      { quality: 'auto', allowHevc: false }
    );
    await jest.advanceTimersByTimeAsync(0);
    expect(listener).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(audio.inspect).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        playbackId: session?.playbackId,
        update: expect.objectContaining({ type: 'delivery' }),
      })
    );
    jest.useRealTimers();
  });

  it('shares each candidate it tries with the viewer and returns the one it plays', async () => {
    type Attempt = { sourceId: number; position: number; total: number };
    const prepare = jest.fn(
      async (_playable: unknown, options: { onSourceAttempt: (attempt: Attempt) => void }) => {
        options.onSourceAttempt({ sourceId: 1, position: 1, total: 3 });
        options.onSourceAttempt({ sourceId: 2, position: 2, total: 3 });
        return { source: { id: 2 }, target: movie({ id: 2 }), state: 'cold' };
      }
    );
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      preparation: { prepare } as never,
      config: { getOrThrow: () => 60000 } as never,
      audioPlaybackService: {
        knownDelivery: jest.fn().mockResolvedValue({ mode: 'direct' }),
      } as never,
    });
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
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      preparation: {
        prepare: async () => ({ source: null, target: null, state: 'cold', exhausted: true }),
      } as never,
      config: { getOrThrow: () => 60000 } as never,
    });

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
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      preparation: { prepare } as never,
      config: { getOrThrow: () => 60000 } as never,
      audioPlaybackService: {
        knownDelivery: jest.fn().mockResolvedValue({ mode: 'direct' }),
      } as never,
    });

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
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      preparation: { prepare } as never,
      config: { getOrThrow: () => 60000 } as never,
      audioPlaybackService: {
        knownDelivery: jest.fn().mockResolvedValue({ mode: 'direct' }),
      } as never,
      progress,
    });

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
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => grants } as never,
      preparation: {
        prepare: async () => ({ source: { id: 1 }, target: movie({ id: 1 }), state: 'cold' }),
      } as never,
      config: { getOrThrow: () => 60000 } as never,
      audioPlaybackService: audio as never,
    });
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
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      preparation: {
        prepare: async () => ({
          source: { id: sourceId },
          target: movie({ id: sourceId }),
          state: 'ready',
        }),
      } as never,
      config: { getOrThrow: () => 60000 } as never,
      audioPlaybackService: {
        knownDelivery: jest.fn().mockResolvedValue({ mode: 'direct' }),
      } as never,
      sourceHealth: {
        onFailed: listener => ((stalled = listener), () => undefined),
        markFailed: jest.fn(),
      },
    });
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
      const service = new PlaybackSessionService({
        db: { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
        preparation: preparation as never,
        config: { getOrThrow: () => 3_600_000 } as never,
        audioPlaybackService: {
          knownDelivery: jest.fn().mockResolvedValue({ mode: 'direct', durationSeconds: 3_600 }),
        } as never,
        sourceHealth,
        downloads,
        playedSources,
      });
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
      /** Stream healthily for `seconds`, delivering bytes every second. */
      const play = async (seconds: number) => {
        for (let second = 0; second < seconds; second++) {
          deliver();
          await tick(1_000);
        }
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
        play,
      };
    };

    afterEach(() => jest.useRealTimers());

    it('continues sampling other sessions after a health lookup fails', async () => {
      const { service, downloads, preparation, start } = setupMonitor();
      await start();
      const second = { id: 3 };
      preparation.prepare.mockResolvedValueOnce({
        source: second,
        target: movie(second),
        state: 'ready',
      });
      await start();
      downloads.getPlaybackHealth.mockRejectedValueOnce(new Error('Media-load unavailable'));

      await service.checkHealth();

      expect(downloads.getPlaybackHealth.mock.calls).toEqual([
        [1, 'movie.mkv'],
        [3, 'movie.mkv'],
      ]);
    });

    it('keeps sampling after an interval check rejects', async () => {
      const { service, downloads, start } = setupMonitor();
      await start();
      jest
        .spyOn(service, 'checkHealth')
        .mockRejectedValueOnce(new Error('Unexpected check failure'));

      await jest.advanceTimersByTimeAsync(2_000);

      expect(downloads.getPlaybackHealth).toHaveBeenCalledTimes(1);
    });

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

    it('stops keeping a failed source for its viewers', async () => {
      const { downloads, sourceHealth, start } = setupMonitor();
      await start();
      const [[failOver]] = sourceHealth.onFailed.mock.calls as unknown as [
        [(sourceId: number) => void],
      ];
      failOver(1);
      expect(downloads.releaseClaims).toHaveBeenCalledWith(1, 'user:user:m:1', 'watched');
      // Another source's failure leaves this viewer's claims alone.
      failOver(3);
      expect(downloads.releaseClaims).toHaveBeenCalledTimes(1);
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
      const { playedSources, start, play } = setupMonitor();
      await start();
      // Measured from the first healthy sample: three minutes later is the 181st.
      await play(180);
      expect(playedSources.recordPlayed).not.toHaveBeenCalled();
      await play(1);
      expect(playedSources.recordPlayed).toHaveBeenCalledWith(1, Date.now());
      // Once per session.
      await play(300);
      expect(playedSources.recordPlayed).toHaveBeenCalledTimes(1);
    });

    it('starts the count over when the stream starves', async () => {
      const { health, playedSources, start, tick, play } = setupMonitor();
      await start();
      await play(150);
      health.blockedSince = Date.now();
      await tick(1_000);
      await play(150);
      expect(playedSources.recordPlayed).not.toHaveBeenCalled();
      await play(31);
      expect(playedSources.recordPlayed).toHaveBeenCalledTimes(1);
    });

    it('counts elapsed time, not deliveries, so bursty reads prove a play in three minutes', async () => {
      const { playedSources, start, tick, deliver } = setupMonitor();
      await start();
      // The player reads a burst every 5 seconds and the health loop samples every 5 seconds. The
      // stretch starts at the first sample (5s); a burst read at 186s completes three minutes.
      for (let burst = 0; burst < 37; burst++) {
        deliver();
        await tick(5_000);
      }
      expect(playedSources.recordPlayed).not.toHaveBeenCalled();
      deliver();
      await tick(5_000);
      expect(playedSources.recordPlayed).toHaveBeenCalledTimes(1);
    });

    it('never records a stream whose reader stopped pulling bytes', async () => {
      const { playedSources, start, tick, deliver } = setupMonitor();
      await start();
      // Delivered once, then the reader applies backpressure: no blocked read, no new bytes.
      deliver();
      for (let second = 0; second < 400; second++) await tick(1_000);
      expect(playedSources.recordPlayed).not.toHaveBeenCalled();
    });

    it('starts the count over when delivery stops or the stream closes', async () => {
      const { health, playedSources, start, tick, play } = setupMonitor();
      await start();
      await play(150);
      // Reader stalls: stalled samples add nothing, and past the delivery window the count resets.
      for (let second = 0; second < 31; second++) await tick(1_000);
      await play(150);
      // Stream closes for a moment.
      health.streaming = false;
      await tick(1_000);
      health.streaming = true;
      await play(180);
      expect(playedSources.recordPlayed).not.toHaveBeenCalled();
      await play(1);
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
      const { playedSources, sourceHealth, start, play } = setupMonitor();
      playedSources.recordPlayed.mockRejectedValue(new Error('database is locked'));
      await start();
      await play(200);
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
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
      preparation: {
        prepare: async () => ({ source: { id: 1 }, target: movie({ id: 1 }), state: 'cold' }),
      } as never,
      config: { getOrThrow: () => 60000 } as never,
      audioPlaybackService: {
        knownDelivery: jest.fn().mockResolvedValue(null),
        inspect: jest.fn().mockRejectedValue(new AudioConversionRequiredError('needs H.264')),
      } as never,
    });
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
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => grants } as never,
      preparation: preparation as never,
      config: { getOrThrow: () => 60000 } as never,
      warmup: warmup as never,
      audioPlaybackService: audio as never,
    });
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
      const service = new PlaybackSessionService({
        db: { getPlaybackGrantRepository: () => grants } as never,
        preparation: preparation as never,
        config: { getOrThrow: () => 60000 } as never,
        audioPlaybackService: audio as never,
      });
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

  describe('a TV that plays remuxes', () => {
    const probe = {
      format: { duration: '600' },
      streams: [
        { codec_type: 'video', codec_name: 'hevc' },
        { codec_type: 'audio', codec_name: 'truehd', channels: 6, tags: { language: 'eng' } },
      ],
    };
    const plan = {
      videoCodec: 'hevc',
      durationSeconds: 600,
      // The TrueHD track, converted to AC-3.
      audio: [{ audioIndex: 0, copy: false, channels: 6, language: 'eng', isDefault: true }],
      subtitles: [],
    };
    const status = (state: string, readySeconds = 0) => ({
      state,
      readySeconds,
      durationSeconds: 600,
    });
    const setupTest = (remuxState: {
      existing?: object | null;
      requested?: object | null;
      /** The viewer's saved position, out of 600 s. */
      positionSeconds?: number;
      /** The TV cannot decode the file's video either: it is converted too. */
      transcodeVideo?: boolean;
      /** What media-load answers when asked for the remux directly. */
      current?: object | null;
      /** Holds the saved-position lookups until released. */
      slowProgress?: boolean;
      /** Source 2 plays as it is, when source 1 is avoided. */
      alternative?: boolean;
      /** The file has a TV version this TV plays (built or being built). */
      usable?: boolean;
      /** Source 2's file cannot be resolved; source 3 plays as it is. */
      unresolvedAlternative?: boolean;
      /** The audio the client decodes; any when absent. */
      supportedAudioCodecs?: string[];
      /** Source 1's file is not probed yet: its delivery is found in the background. */
      unprobed?: boolean;
    }) => {
      let changed: ((status: object) => void) | undefined;
      let resync: (() => void) | undefined;
      const lookups: Array<() => void> = [];
      const remux = {
        existing: jest.fn(async () =>
          remuxState.existing ? { status: remuxState.existing, plan, probe } : null
        ),
        request: jest.fn(async () =>
          remuxState.requested === null
            ? null
            : { status: remuxState.requested ?? status('queued'), plan, probe }
        ),
        onChange: jest.fn((listener: typeof changed, onResync?: () => void) => {
          changed = listener;
          resync = onResync;
          return () => undefined;
        }),
        usable: jest.fn(async () => remuxState.usable ?? false),
        status: jest.fn(async (sourceId: number) =>
          remuxState.current ? { sourceId, filePath: 'movie.mkv', ...remuxState.current } : null
        ),
      };
      const downloads = { releaseClaims: jest.fn(async () => undefined) };
      const preparation = {
        prepare: jest.fn(
          async (
            _playable: unknown,
            options: {
              avoidSourceIds?: number[];
              resolveOnly?: boolean;
            }
          ) => {
            const avoided = options.avoidSourceIds ?? [];
            if (!avoided.includes(1))
              return { source: { id: 1 }, target: movie({ id: 1 }), state: 'ready' };
            if (remuxState.unresolvedAlternative) {
              if (!avoided.includes(2)) return { source: { id: 2 }, target: null, state: 'ready' };
              if (!avoided.includes(3))
                return { source: { id: 3 }, target: movie({ id: 3 }), state: 'ready' };
            }
            if (remuxState.alternative && !avoided.includes(2))
              return { source: { id: 2 }, target: movie({ id: 2 }), state: 'ready' };
            return { source: null, target: null, state: 'cold' };
          }
        ),
      };
      const service = new PlaybackSessionService({
        db: { getPlaybackGrantRepository: () => ({ create: jest.fn() }) } as never,
        preparation: preparation as never,
        config: { getOrThrow: () => 60000 } as never,
        warmup: { promote: jest.fn() } as never,
        audioPlaybackService: {
          knownDelivery: jest.fn(async (target: { source: { id: number } }) =>
            remuxState.unprobed && target.source.id === 1
              ? null
              : {
                  mode: target.source.id === 1 ? 'audio-transcode' : 'direct',
                  durationSeconds: 600,
                  transcodeVideo: remuxState.transcodeVideo ?? false,
                }
          ),
          inspect: jest.fn(async () => ({
            mode: 'audio-transcode',
            durationSeconds: 600,
            transcodeVideo: remuxState.transcodeVideo ?? false,
          })),
        } as never,
        remux: remux as never,
        downloads: downloads as never,
        progress: {
          findByKey: jest.fn(async () => {
            if (remuxState.slowProgress) await new Promise<void>(resolve => lookups.push(resolve));
            return remuxState.positionSeconds
              ? {
                  state: 'in_progress',
                  positionSeconds: remuxState.positionSeconds,
                  durationSeconds: 600,
                }
              : null;
          }),
        } as never,
      });
      const listener = jest.fn();
      service.onDeliveryUpdate(listener);
      const create = () =>
        service.create(
          'user',
          { kind: 'movie', mediaId: 7 },
          {
            quality: 'auto',
            allowHevc: true,
            avoidAudioConversion: true,
            playsRemux: true,
            ...(remuxState.supportedAudioCodecs
              ? { supportedAudioCodecs: remuxState.supportedAudioCodecs }
              : {}),
          },
          { sessionId: 'session' }
        );
      /** media-load reports a remux of `sourceId`'s movie.mkv. */
      const report = (sourceId: number, state: string, readySeconds = 0) =>
        changed?.({ sourceId, filePath: 'movie.mkv', ...status(state, readySeconds) });
      const releaseLookups = () => lookups.splice(0).forEach(release => release());
      return {
        create,
        remux,
        downloads,
        preparation,
        listener,
        report,
        resync: () => resync?.(),
        releaseLookups,
      };
    };

    it('plays a finished remux natively instead of converting or switching sources', async () => {
      const { create, remux, preparation } = setupTest({ existing: status('complete', 600) });
      const session = await create();
      expect(session?.delivery?.mode).toBe('remux');
      expect(session?.streamUrl).toMatch(/\/remux\/index\.m3u8$/);
      expect(remux.request).not.toHaveBeenCalled();
      // No other source was looked for.
      expect(preparation.prepare).toHaveBeenCalledTimes(1);
    });

    it('plays a remux being built once it is ahead of the viewer', async () => {
      const { create, remux } = setupTest({ requested: status('running', 120) });
      const session = await create();
      expect(remux.request).toHaveBeenCalledWith(movie({ id: 1 }), 'watching');
      expect(session?.delivery?.mode).toBe('remux');
    });

    const recreated = (playbackId?: string) =>
      expect.objectContaining({
        playbackId,
        update: { type: 'recreate', reason: 'A TV version of this file is ready.' },
      });
    const settle = () => new Promise(resolve => setTimeout(resolve, 0));

    it('converts while the remux is built, and recreates the session once it is ready', async () => {
      const { create, listener, report } = setupTest({});
      const session = await create();
      expect(session?.streamUrl).toMatch(/\/audio$/);
      report(2, 'complete', 600);
      await settle();
      expect(listener).not.toHaveBeenCalled();
      report(1, 'complete', 600);
      await settle();
      expect(listener).toHaveBeenCalledWith(recreated(session?.playbackId));
      report(1, 'complete', 600);
      await settle();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('recreates a session probed in the background once its remux is ready', async () => {
      // The remux finished before the probe ended: its event reached no waiting session.
      const { create, listener } = setupTest({ unprobed: true, current: status('complete', 600) });
      const session = await create();
      expect(session?.deliveryPending).toBe(true);
      await settle();
      await settle();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ update: expect.objectContaining({ type: 'delivery' }) })
      );
      expect(listener).toHaveBeenLastCalledWith(recreated(session?.playbackId));
    });

    it('recreates the session once the remux being built is a minute past the viewer', async () => {
      const { create, listener, report } = setupTest({ positionSeconds: 300 });
      const session = await create();
      expect(session?.delivery?.mode).toBe('audio-transcode');
      report(1, 'running', 330);
      await settle();
      expect(listener).not.toHaveBeenCalled();
      report(1, 'running', 360);
      await settle();
      expect(listener).toHaveBeenCalledWith(recreated(session?.playbackId));
      report(1, 'complete', 600);
      await settle();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('keeps converting the video for a TV that cannot decode it, remux or not', async () => {
      const { create, remux } = setupTest({
        existing: status('complete', 600),
        transcodeVideo: true,
      });
      const session = await create();
      expect(session?.delivery?.mode).toBe('audio-transcode');
      expect(remux.existing).not.toHaveBeenCalled();
      expect(remux.request).not.toHaveBeenCalled();
    });

    it('checks the remux a session waits for after missing its events', async () => {
      const { create, listener, resync } = setupTest({ current: status('complete', 600) });
      const session = await create();
      expect(session?.delivery?.mode).toBe('audio-transcode');
      resync();
      await settle();
      await settle();
      expect(listener).toHaveBeenCalledWith(recreated(session?.playbackId));
    });

    it('checks a completion heard while the previous progress was being checked', async () => {
      const { create, listener, report, releaseLookups } = setupTest({
        positionSeconds: 300,
        slowProgress: true,
      });
      const pending = create();
      await settle();
      releaseLookups();
      const session = await pending;
      report(1, 'running', 330);
      await settle();
      report(1, 'complete', 600);
      releaseLookups();
      await settle();
      await settle();
      expect(listener).toHaveBeenCalledWith(recreated(session?.playbackId));
    });

    it('moves to a release that plays as it is when the file has no TV version', async () => {
      const { create, downloads } = setupTest({ alternative: true });
      const session = await create();
      expect(session?.source.id).toBe(2);
      expect(session?.delivery?.mode).toBe('direct');
      // The release that needed conversion is no longer kept for this viewer.
      expect(downloads.releaseClaims).toHaveBeenCalledWith(1, expect.any(String), 'watched');
      expect(downloads.releaseClaims).not.toHaveBeenCalledWith(2, expect.anything(), 'watched');
    });

    it('waits for the old watched claim to release before warming a replacement in a one-source cache', async () => {
      const { create, downloads, preparation } = setupTest({ alternative: true });
      let oldSourcePinned = true;
      downloads.releaseClaims.mockImplementationOnce(async () => {
        await settle();
        oldSourcePinned = false;
      });
      const prepare = preparation.prepare.getMockImplementation()!;
      preparation.prepare.mockImplementation(async (playable, options) => {
        const result = await prepare(playable, options);
        if (result.source?.id === 2 && !options.resolveOnly && oldSourcePinned)
          return { ...result, state: 'cold' };
        return result;
      });

      const session = await create();
      expect(session?.source.id).toBe(2);
      expect(session?.preparation.state).toBe('warm');
    });

    it('keeps a release whose TV version is being built, converting until it is ahead', async () => {
      const { create, remux, report, listener } = setupTest({
        alternative: true,
        usable: true,
        requested: status('running', 30),
        positionSeconds: 300,
      });
      const session = await create();
      expect(session?.source.id).toBe(1);
      expect(session?.delivery?.mode).toBe('audio-transcode');
      expect(remux.request).toHaveBeenCalledWith(movie({ id: 1 }), 'watching');
      report(1, 'running', 360);
      await settle();
      await settle();
      expect(listener).toHaveBeenCalledWith(recreated(session?.playbackId));
    });

    it('keeps converting for a client that cannot decode the remux audio', async () => {
      const { create, report, listener } = setupTest({
        existing: status('complete', 600),
        requested: status('complete', 600),
        supportedAudioCodecs: ['aac'],
      });
      const session = await create();
      expect(session?.delivery?.mode).toBe('audio-transcode');
      report(1, 'complete', 600);
      await settle();
      expect(listener).not.toHaveBeenCalled();
    });

    it('checks the remux again once the session is registered', async () => {
      // Queued when asked for, finished by the time the session exists: no event follows.
      const { create, listener } = setupTest({
        requested: status('queued'),
        current: status('complete', 600),
      });
      const session = await create();
      expect(session?.delivery?.mode).toBe('audio-transcode');
      await settle();
      await settle();
      expect(listener).toHaveBeenCalledWith(recreated(session?.playbackId));
    });

    it('looks past a release whose file cannot be resolved', async () => {
      const { create } = setupTest({ unresolvedAlternative: true });
      const session = await create();
      expect(session?.source.id).toBe(3);
      expect(session?.delivery?.mode).toBe('direct');
    });

    it('converts as before when no remux can be built', async () => {
      const { create, listener, report } = setupTest({ requested: null });
      const session = await create();
      expect(session?.delivery?.mode).toBe('audio-transcode');
      report(1, 'complete', 600);
      await settle();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('a TV that avoids converted audio', () => {
    /** Sources 1..n ranked in order; preparation picks the first one not avoided. */
    const setupTest = (deliveries: Record<number, { mode: string } | null>) => {
      const grants = { create: jest.fn() };
      const ids = Object.keys(deliveries).map(Number);
      const preparation = {
        prepare: jest.fn(async (_playable: unknown, options: { avoidSourceIds?: number[] }) => {
          const id = ids.find(candidate => !options.avoidSourceIds?.includes(candidate));
          return id === undefined
            ? { source: null, target: null, state: 'cold' }
            : { source: { id }, target: movie({ id }), state: 'ready' };
        }),
      };
      const audio = {
        knownDelivery: jest.fn(async (target: { source: { id: number } }) =>
          deliveries[target.source.id]
            ? { durationSeconds: 60, ...deliveries[target.source.id] }
            : null
        ),
        inspect: jest.fn(async (target: { source: { id: number } }) => ({
          durationSeconds: 60,
          ...(deliveries[target.source.id] ?? { mode: 'audio-transcode' }),
        })),
      };
      const service = new PlaybackSessionService({
        db: { getPlaybackGrantRepository: () => grants } as never,
        preparation: preparation as never,
        config: { getOrThrow: () => 60000 } as never,
        warmup: { promote: jest.fn() } as never,
        audioPlaybackService: audio as never,
      });
      const create = () =>
        service.create(
          'user',
          { kind: 'movie', mediaId: 7 },
          { quality: 'auto', allowHevc: true, avoidAudioConversion: true },
          { sessionId: 'session' }
        );
      return { service, create, grants, audio };
    };

    it('plays the next source that needs no conversion', async () => {
      const { create, grants } = setupTest({
        1: { mode: 'audio-transcode' },
        2: { mode: 'direct' },
      });
      const session = await create();
      expect(session?.source.id).toBe(2);
      expect(session?.delivery?.mode).toBe('direct');
      expect(grants.create).toHaveBeenCalledWith(expect.objectContaining({ sourceId: 2 }));
    });

    it('skips other sources known to need conversion, and tries an unprobed one directly', async () => {
      const { create } = setupTest({
        1: { mode: 'audio-transcode' },
        2: { mode: 'audio-transcode' },
        3: null,
      });
      const session = await create();
      expect(session?.source.id).toBe(3);
      expect(session?.deliveryPending).toBe(true);
    });

    it('converts when every other source needs conversion too', async () => {
      const { create } = setupTest({
        1: { mode: 'audio-transcode' },
        2: { mode: 'audio-transcode' },
      });
      const session = await create();
      expect(session?.source.id).toBe(1);
      expect(session?.streamUrl).toContain('/audio');
    });

    it('asks to recreate a session whose probe finds converted audio while another source may play', async () => {
      const { service, create } = setupTest({ 1: null, 2: null });
      const listener = jest.fn();
      service.onDeliveryUpdate(listener);
      await create();
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { type: 'recreate', reason: 'The source needs audio conversion.' },
        })
      );
    });
  });

  it('preserves a known conversion failure without issuing a grant', async () => {
    const grants = { create: jest.fn() };
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => grants } as never,
      preparation: {
        prepare: async () => ({ source: { id: 1 }, target: movie({ id: 1 }), state: 'cold' }),
      } as never,
      config: { getOrThrow: () => 60000 } as never,
      audioPlaybackService: {
        knownDelivery: jest
          .fn()
          .mockRejectedValue(new AudioConversionRequiredError('unsupported video')),
      } as never,
    });
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
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => grants } as never,
      preparation: preparation as never,
      config: { getOrThrow: () => 60_000 } as never,
      warmup: warmup as never,
      audioPlaybackService: audio as never,
    });
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
    const storageService = { getStorageState: jest.fn().mockResolvedValue(null) };
    const database = {
      getPlaybackGrantRepository: jest.fn().mockReturnValue(grants),
    } as unknown as Database;
    const config = { getOrThrow: jest.fn().mockReturnValue(60_000) };
    const service = new PlaybackSessionService({
      db: database,
      preparation: preparation as never,
      config: config as never,
      warmup: warmup as never,
      storage: storageService as never,
    });

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
    const service = new PlaybackSessionService({
      db: { getPlaybackGrantRepository: () => grants } as never,
      preparation: {
        prepare: async () => ({ source: { id: 3 }, target: null, state: 'cold' }),
      } as never,
      config: { getOrThrow: () => 60000 } as never,
      audioPlaybackService: audio as never,
    });

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

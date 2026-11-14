import type { RemuxStatus } from '@miauflix/service-contracts';

import type { PlaybackDelivery, ProbeResult } from './audio-playback.service';
import {
  codecsPlayable,
  OpenedPlaylists,
  playlistStartingAt,
  remuxCodecs,
  remuxDelivery,
  remuxPlan,
  remuxPlayable,
  TvRemuxService,
} from './tv-remux.service';

const stream = (
  codec_type: string,
  codec_name: string,
  extra: Partial<NonNullable<ProbeResult['streams']>[number]> = {}
) => ({ codec_type, codec_name, ...extra });

const mobland: ProbeResult = {
  format: { duration: '3539.5', format_name: 'matroska,webm' },
  streams: [
    stream('video', 'hevc'),
    stream('audio', 'truehd', {
      channels: 8,
      tags: { language: 'eng', title: 'TrueHD 7.1' },
      disposition: { default: 1 },
    }),
    stream('audio', 'aac', { channels: 2, tags: { language: 'eng', title: 'Commentary' } }),
    stream('audio', 'dts', { channels: 6, tags: { language: 'ita' } }),
    stream('audio', 'aac', { channels: 2, tags: { language: 'ita', title: 'Stereo' } }),
    stream('audio', 'truehd', { channels: 6, tags: { language: 'fra' } }),
    stream('audio', 'dts', { channels: 8, tags: { language: 'fr' } }),
    stream('subtitle', 'subrip', { tags: { language: 'eng' }, disposition: { forced: 1 } }),
    stream('subtitle', 'hdmv_pgs_subtitle', {
      tags: { language: 'eng' },
      disposition: { hearing_impaired: 1 },
    }),
    stream('subtitle', 'ass', { tags: { language: 'jpn', title: 'Signs' } }),
    stream('subtitle', 'eia_608'),
    stream('attachment', 'ttf'),
  ],
};

describe('remuxPlan', () => {
  it('keeps one TV audio track per language, copying a compatible one or converting the fullest', () => {
    const plan = remuxPlan(mobland)!;
    expect(plan.videoCodec).toBe('hevc');
    expect(plan.durationSeconds).toBe(3539.5);
    // English and Italian have AAC (copied); French has none, so the 7.1 DTS is converted.
    expect(plan.audio).toEqual([
      expect.objectContaining({ audioIndex: 1, copy: true, language: 'eng', isDefault: true }),
      expect.objectContaining({ audioIndex: 3, copy: true, language: 'ita', isDefault: false }),
      expect.objectContaining({ audioIndex: 5, copy: false, channels: 8, language: 'fr' }),
    ]);
  });

  it('converts E-AC-3 to AC-3, which AVPlay plays in MPEG-TS, unless the language has more', () => {
    const plan = remuxPlan({
      format: { duration: '60' },
      streams: [
        stream('video', 'hevc'),
        stream('audio', 'eac3', { channels: 6, tags: { language: 'eng' } }),
        stream('audio', 'truehd', { channels: 8, tags: { language: 'ita' } }),
        stream('audio', 'eac3', { channels: 6, tags: { language: 'fra' } }),
        stream('audio', 'ac3', { channels: 2, tags: { language: 'fra' } }),
      ],
    })!;
    expect(plan.audio.map(track => [track.audioIndex, track.copy])).toEqual([
      [0, false],
      [1, false],
      [3, true],
    ]);
  });

  it('keeps every subtitle track it can, with its flags', () => {
    expect(remuxPlan(mobland)!.subtitles).toEqual([
      expect.objectContaining({ subtitleIndex: 0, kind: 'text', forced: true }),
      expect.objectContaining({ subtitleIndex: 1, kind: 'image', hearingImpaired: true }),
      expect.objectContaining({ subtitleIndex: 2, kind: 'styled', title: 'Signs' }),
    ]);
  });

  it('needs no remux when every language has audio the TV decodes, or for other video', () => {
    const playable: ProbeResult = {
      format: { duration: '60' },
      streams: [stream('video', 'h264'), stream('audio', 'eac3'), stream('audio', 'truehd')],
    };
    expect(remuxPlan(playable)).toBeNull();
    expect(
      remuxPlan({
        format: { duration: '60' },
        streams: [stream('video', 'av1'), stream('audio', 'truehd')],
      })
    ).toBeNull();
    expect(
      remuxPlan({ format: { duration: '60' }, streams: [stream('video', 'h264')] })
    ).toBeNull();
  });
});

describe('remuxDelivery', () => {
  it('lists the remux audio tracks, converted ones as AC-3 5.1', () => {
    const base = {
      mode: 'audio-transcode',
      durationSeconds: 3539.5,
      audioCodec: 'truehd',
      mimeType: 'video/mp4',
    } as PlaybackDelivery;
    const delivery = remuxDelivery(base, remuxPlan(mobland)!, mobland);
    expect(delivery).toMatchObject({
      mode: 'remux',
      audioCodec: 'aac',
      defaultAudioTrackIndex: 0,
      mimeType: 'application/vnd.apple.mpegurl',
    });
    expect(delivery.audioTracks?.map(track => [track.index, track.codec, track.channels])).toEqual([
      [0, 'aac', 2],
      [1, 'aac', 2],
      [2, 'ac3', 6],
    ]);
  });
});

describe('remuxPlayable', () => {
  const status = (state: RemuxStatus['state'], readySeconds: number): RemuxStatus => ({
    sourceId: 1,
    filePath: 'a.mkv',
    state,
    priority: 'watching',
    readySeconds,
    durationSeconds: 600,
    bytes: 0,
    subtitles: [],
  });

  it('plays a finished remux, or one built a minute past the start', () => {
    expect(remuxPlayable(status('complete', 600), 500)).toBe(true);
    expect(remuxPlayable(status('running', 90))).toBe(true);
    expect(remuxPlayable(status('running', 90), 60)).toBe(false);
    expect(remuxPlayable(status('queued', 0))).toBe(false);
    expect(remuxPlayable(status('failed', 0))).toBe(false);
  });
});

describe('TvRemuxService', () => {
  const target = { source: { id: 4 }, filePath: 'S01E02.mkv', matchKind: 'single' } as never;
  const setupTest = (options: { complete?: boolean[]; probe?: ProbeResult | null } = {}) => {
    const complete = [...(options.complete ?? [true])];
    const mediaLoad = {
      requestRemux: jest.fn(
        async (_target: unknown, plan: { durationSeconds: number }, priority: string) => ({
          state: 'queued',
          priority,
          durationSeconds: plan.durationSeconds,
        })
      ),
      getRemuxStatus: jest.fn(async () => null),
      isFileComplete: jest.fn(async () => complete.shift() ?? true),
      onRemuxChanged: jest.fn(() => () => undefined),
    };
    const audio = {
      knownProbe: jest.fn(async () => (options.probe === undefined ? mobland : options.probe)),
      probeFile: jest.fn(async () => mobland),
    };
    return { service: new TvRemuxService(mediaLoad as never, audio as never), mediaLoad, audio };
  };

  it('asks for a remux of a probed file that needs one', async () => {
    const { service, mediaLoad } = setupTest();
    const requested = await service.request(target, 'watching');
    expect(requested?.status).toMatchObject({ state: 'queued', priority: 'watching' });
    expect(mediaLoad.requestRemux).toHaveBeenCalledWith(
      target,
      expect.objectContaining({ videoCodec: 'hevc' }),
      'watching'
    );
  });

  it('asks for nothing for a file not probed yet, and survives an older media-load', async () => {
    expect(await setupTest({ probe: null }).service.request(target, 'watching')).toBeNull();
    const { service, mediaLoad } = setupTest();
    mediaLoad.requestRemux.mockRejectedValueOnce(new Error('unsupported'));
    expect(await service.request(target, 'watching')).toBeNull();
  });

  it('remuxes a prefetched episode once it is downloaded', async () => {
    jest.useFakeTimers();
    try {
      const { service, mediaLoad, audio } = setupTest({ complete: [false, false, true] });
      service.requestWhenDownloaded(target);
      service.requestWhenDownloaded(target);
      await jest.advanceTimersByTimeAsync(0);
      expect(mediaLoad.isFileComplete).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(120_000);
      expect(audio.probeFile).toHaveBeenCalledWith(target);
      expect(mediaLoad.requestRemux).toHaveBeenCalledWith(target, expect.anything(), 'next');
      await jest.advanceTimersByTimeAsync(600_000);
      expect(mediaLoad.isFileComplete).toHaveBeenCalledTimes(3);
      service.close();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('playlistStartingAt', () => {
  const playlist = (count: number, ended = false) =>
    [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-TARGETDURATION:6',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-PLAYLIST-TYPE:EVENT',
      ...Array.from({ length: count }, (_, index) => [
        '#EXTINF:6.000000,',
        `seg${String(index).padStart(5, '0')}.ts`,
      ]).flat(),
      ...(ended ? ['#EXT-X-ENDLIST'] : []),
      '',
    ].join('\n');
  const segments = (text: string) => text.split('\n').filter(line => line.endsWith('.ts'));

  it('ends two segments past the one at the start, where AVPlay then starts', () => {
    // 1194.3 s is in segment 199 (1194 to 1200 s).
    const cut = playlistStartingAt(playlist(250), 1194.3);
    expect(segments(cut)).toHaveLength(202);
    expect(segments(cut).slice(-3)).toEqual(['seg00199.ts', 'seg00200.ts', 'seg00201.ts']);
    expect(cut).toMatch(/^#EXTM3U\n#EXT-X-VERSION:3\n/);
    expect(cut).toMatch(/seg00201\.ts\n$/);
    expect(cut).not.toContain('ENDLIST');
  });

  it('starts at the first segments from the beginning', () => {
    expect(segments(playlistStartingAt(playlist(250), 0))).toEqual([
      'seg00000.ts',
      'seg00001.ts',
      'seg00002.ts',
    ]);
  });

  it('leaves a finished playlist, or a start past what is listed, as it is', () => {
    expect(playlistStartingAt(playlist(250, true), 600)).toBe(playlist(250, true));
    expect(playlistStartingAt(playlist(10), 600)).toBe(playlist(10));
  });
});

describe('OpenedPlaylists', () => {
  it('cuts the playlist until the playback asks for a segment, and again six hours later', () => {
    let now = 0;
    const opened = new OpenedPlaylists(() => now);
    expect(opened.cut('key')).toBe(true);
    // AVPlay reads it a second time as it opens, however long the first read took.
    now = 5_000;
    expect(opened.cut('key')).toBe(true);
    opened.segmentRequested('key');
    expect(opened.cut('key')).toBe(false);
    expect(opened.cut('other')).toBe(true);
    now = 6 * 60 * 60_000;
    expect(opened.cut('key')).toBe(true);
  });
});

describe('TV versions recorded as versions of their file', () => {
  const target = { source: { id: 4 }, filePath: 'S01E02.mkv', matchKind: 'single' } as never;
  const setupTest = () => {
    const rows = new Map<
      string,
      { state: string; videoCodec: string | null; audioCodecs: string[] }
    >();
    const key = (sourceId: number, filePath: string, kind: string) =>
      `${sourceId}:${filePath}:${kind}`;
    const variants = {
      find: jest.fn(
        async (sourceId: number, filePath: string, kind: string) =>
          rows.get(key(sourceId, filePath, kind)) ?? null
      ),
      save: jest.fn(
        async (
          sourceId: number,
          filePath: string,
          kind: string,
          state: string,
          codecs: { videoCodec: string | null; audioCodecs: string[] }
        ) => {
          rows.set(key(sourceId, filePath, kind), { state, ...codecs });
        }
      ),
      setState: jest.fn(async (sourceId: number, filePath: string, kind: string, state: string) => {
        const row = rows.get(key(sourceId, filePath, kind));
        if (row) row.state = state;
        return !!row;
      }),
      remove: jest.fn(async (sourceId: number, filePath: string, kind: string) => {
        rows.delete(key(sourceId, filePath, kind));
      }),
    };
    let changed: ((status: RemuxStatus) => void) | undefined;
    const mediaLoad = {
      requestRemux: jest.fn(async () => ({ state: 'running', readySeconds: 600 })),
      getRemuxStatus: jest.fn(async () => null),
      isFileComplete: jest.fn(async () => true),
      onRemuxChanged: jest.fn((listener: (status: RemuxStatus) => void) => {
        changed = listener;
        return () => undefined;
      }),
    };
    const audio = { knownProbe: jest.fn(async () => mobland), probeFile: jest.fn() };
    const lookups: Array<() => void> = [];
    let slowProbes = false;
    const probes = {
      find: jest.fn(async () => {
        if (slowProbes) await new Promise<void>(resolve => lookups.push(resolve));
        return JSON.stringify(mobland);
      }),
    };
    const service = new TvRemuxService(
      mediaLoad as never,
      audio as never,
      variants as never,
      probes as never
    );
    const report = async (state: string, sourceId = 4) => {
      changed?.({ sourceId, filePath: 'S01E02.mkv', state } as RemuxStatus);
      await new Promise(resolve => setTimeout(resolve, 0));
    };
    const row = (sourceId = 4) => rows.get(key(sourceId, 'S01E02.mkv', 'remux'));
    const holdProbes = () => {
      slowProbes = true;
      return () => lookups.splice(0).forEach(release => release());
    };
    return { service, report, row, holdProbes };
  };
  const tv = { supportedAudioCodecs: ['aac', 'ac3', 'eac3'], allowHevc: true };

  it('records a requested TV version with its own codecs, and follows it until ready', async () => {
    const { service, report, row } = setupTest();
    await service.request(target, 'watching');
    const codecs = remuxCodecs(remuxPlan(mobland)!, mobland);
    expect(codecs.audioCodecs).not.toContain('truehd');
    expect(row()).toEqual({ state: 'building', ...codecs, container: 'mpegts' });
    // Usable while it is built: its source plays natively soon.
    expect(await service.usable(target, tv)).toBe(true);
    await report('complete');
    expect(row()?.state).toBe('ready');
    await report('failed');
    expect(row()).toBeUndefined();
    expect(await service.usable(target, tv)).toBe(false);
  });

  it('records a TV version media-load reports from the stored probe', async () => {
    const { report, row } = setupTest();
    await report('running', 9);
    expect(row(9)).toMatchObject({ state: 'building', videoCodec: 'hevc' });
  });

  it('keeps a failure heard while an earlier status was still being recorded', async () => {
    const { report, row, holdProbes } = setupTest();
    const release = holdProbes();
    await report('running', 9);
    await report('failed', 9);
    release();
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(row(9)).toBeUndefined();
  });

  it('counts a version usable only when the client plays its codecs', () => {
    const version = { videoCodec: 'hevc', audioCodecs: ['ac3'] };
    expect(codecsPlayable(version, tv)).toBe(true);
    expect(codecsPlayable(version, { ...tv, allowHevc: false })).toBe(false);
    expect(codecsPlayable(version, { ...tv, supportedVideoCodecs: ['h264'] })).toBe(false);
    expect(codecsPlayable(version, { ...tv, supportedAudioCodecs: ['aac'] })).toBe(false);
  });
});

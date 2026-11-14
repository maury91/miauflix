import type { RemuxStatus } from '@miauflix/service-contracts';

import type { PlaybackDelivery, ProbeResult } from './audio-playback.service';
import {
  OpenedPlaylists,
  playlistStartingAt,
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

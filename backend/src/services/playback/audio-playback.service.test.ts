import {
  audioConversionArgs,
  AudioPlaybackError,
  AudioPlaybackService,
  deliveryFromProbe,
  explicitCredits,
  explicitIntro,
} from './audio-playback.service';

describe('audio playback delivery', () => {
  const setupTest = (audioCodec = 'ac3', videoCodec = 'h264') => ({
    format: { duration: '120.5' },
    streams: [
      { codec_type: 'video', codec_name: videoCodec, extradata: '\n00000000: 0164 0028 ffe1 00ab' },
      { codec_type: 'audio', codec_name: audioCodec },
    ],
  });

  it('converts actual AC-3 to AAC while advertising the actual H.264 profile', () => {
    expect(deliveryFromProbe(setupTest())).toMatchObject({
      mode: 'audio-transcode',
      audioCodec: 'ac3',
      durationSeconds: 120.5,
      mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    });
  });

  it.each(['aac', 'mp3', 'opus', 'vorbis', 'flac'])(
    'keeps %s on the existing direct path',
    codec => {
      expect(deliveryFromProbe(setupTest(codec)).mode).toBe('direct');
    }
  );

  it('exposes language, title and default disposition for every audio stream', () => {
    const probe = setupTest();
    const delivery = deliveryFromProbe({
      ...probe,
      streams: [
        probe.streams[0],
        { codec_type: 'audio', codec_name: 'ac3', channels: 6, tags: { language: 'fra' } },
        {
          codec_type: 'audio',
          codec_name: 'aac',
          channels: 2,
          tags: { language: 'eng', title: 'Original' },
          disposition: { default: 1 },
        },
      ],
    });
    expect(delivery.defaultAudioTrackIndex).toBe(1);
    expect(delivery.audioTracks).toMatchObject([
      { index: 0, language: 'fra', title: null, codec: 'ac3', channels: 6, isDefault: false },
      { index: 1, language: 'eng', title: 'Original', codec: 'aac', channels: 2, isDefault: true },
    ]);
    expect(delivery.mode).toBe('direct');
    expect(audioConversionArgs('http://localhost/input', 45, 1)).toContain('0:a:1');
  });

  it('rejects missing duration and video that would require video transcoding', () => {
    expect(() => deliveryFromProbe({ ...setupTest(), format: { duration: 'NaN' } })).toThrow(
      AudioPlaybackError
    );
    expect(() => deliveryFromProbe(setupTest('ac3', 'hevc'))).toThrow('H.264');
  });

  const hevcProbe = (audioCodec = 'ac3', formatName?: string) => ({
    ...setupTest(audioCodec, 'hevc'),
    format: { duration: '120.5', format_name: formatName },
    streams: [
      {
        codec_type: 'video',
        codec_name: 'hevc',
        extradata: '00000000: 0101 6000 0000 b000 0000 0000 5d00 f000',
      },
      { codec_type: 'audio', codec_name: audioCodec },
    ],
  });

  it('returns supported HEVC and audio as-is, even when conversion is enabled', () => {
    expect(deliveryFromProbe(hevcProbe('aac'), { allowHevc: true }, true)).toMatchObject({
      mode: 'direct',
    });
  });

  it('copies supported HEVC while converting unsupported audio', () => {
    expect(
      deliveryFromProbe(
        hevcProbe(),
        {
          allowHevc: true,
          supportedMseVideoCodecs: ['hevc'],
          supportedAudioCodecs: ['aac'],
        },
        true
      )
    ).toMatchObject({
      mode: 'audio-transcode',
      transcodeVideo: false,
      videoCodec: 'hevc',
      mimeType: 'video/mp4; codecs="hvc1.1.6.L93.B0, mp4a.40.2"',
    });
    expect(audioConversionArgs('http://localhost/input', 0, 0, false, 'hevc')).toContain('hvc1');
  });

  it('converts HEVC only when the client needs it and server policy enables it', () => {
    expect(deliveryFromProbe(hevcProbe('aac'), { allowHevc: false }, true)).toMatchObject({
      mode: 'audio-transcode',
      transcodeVideo: true,
      videoCodec: 'h264',
      mimeType: 'video/mp4; codecs="avc1.640029, mp4a.40.2"',
    });
    expect(() => deliveryFromProbe(hevcProbe('aac'), { allowHevc: false }, false)).toThrow(
      'video conversion is disabled'
    );
    const args = audioConversionArgs('http://localhost/input', 0, 0, true, 'transcode');
    expect(args).toContain('libx264');
    expect(args.slice(args.indexOf('-c:a'), args.indexOf('-c:a') + 2)).toEqual(['-c:a', 'copy']);
  });

  it('uses the probed container when deciding whether native HEVC is supported', () => {
    const preferences = {
      allowHevc: true,
      nativeHevcContainers: ['mp4'] as ('matroska' | 'mp4')[],
    };
    expect(deliveryFromProbe(hevcProbe('aac', 'mov,mp4,m4a,3gp,3g2,mj2'), preferences).mode).toBe(
      'direct'
    );
    expect(
      deliveryFromProbe(hevcProbe('aac', 'matroska,webm'), {
        ...preferences,
        supportedMseVideoCodecs: ['hevc'],
      })
    ).toMatchObject({ mode: 'audio-transcode', transcodeVideo: false, videoCodec: 'hevc' });
    expect(() => deliveryFromProbe(hevcProbe('aac', 'avi'), preferences)).toThrow(
      'client cannot decode H.265'
    );
    expect(() => deliveryFromProbe(hevcProbe('aac', 'unknown'), preferences)).toThrow(
      'client cannot decode H.265'
    );
  });

  it('preserves the legacy HEVC preference behavior when container capabilities are omitted', () => {
    expect(deliveryFromProbe(hevcProbe('aac', 'avi'), { allowHevc: true }).mode).toBe('direct');
  });

  it('rejects attempts to enable video conversion through a stream URL when disabled', async () => {
    const service = new AudioPlaybackService({} as never, { get: () => false } as never);
    await expect(
      service.stream(
        {} as never,
        'owner',
        0,
        new Date(Date.now() + 1000),
        new AbortController().signal,
        0,
        false,
        true
      )
    ).rejects.toThrow('Video conversion is disabled');
  });

  it('does not convert an unwanted secondary language, even with Annex B video', () => {
    const probe = setupTest('aac');
    probe.streams[0].extradata = '00000000: 0000 0001 6742';
    probe.streams.push({ codec_type: 'audio', codec_name: 'ac3' });
    expect(
      deliveryFromProbe(probe, { audioLanguages: ['en'], supportedAudioCodecs: ['aac'] }).mode
    ).toBe('direct');
  });

  it('plays a decodable track in the same language on a player that switches tracks', () => {
    const video = setupTest().streams[0];
    const probe = (tracks: Array<[codec: string, language?: string]>) => ({
      format: { duration: '120', format_name: 'matroska,webm' },
      streams: [
        video,
        ...tracks.map(([codec, language], index) => ({
          codec_type: 'audio',
          codec_name: codec,
          ...(language ? { tags: { language } } : {}),
          disposition: { default: index === 0 ? 1 : 0 },
        })),
      ],
    });
    // What the Samsung TV (AVPlay) reports
    const tv = {
      audioLanguages: ['en-GB'],
      supportedAudioCodecs: ['aac', 'mp3', 'ac3', 'eac3', 'flac'],
      nativeAudioTracks: true,
    };

    expect(
      deliveryFromProbe(
        probe([
          ['truehd', 'eng'],
          ['ac3', 'fre'],
          ['ac3', 'eng'],
        ]),
        tv
      )
    ).toMatchObject({ mode: 'direct', defaultAudioTrackIndex: 2, audioCodec: 'ac3' });
    // No decodable track in the wanted language: convert it rather than switch language
    expect(
      deliveryFromProbe(
        probe([
          ['truehd', 'eng'],
          ['ac3', 'fre'],
        ]),
        tv
      )
    ).toMatchObject({ mode: 'audio-transcode', defaultAudioTrackIndex: 0 });
    // Tracks without a language: any decodable one
    expect(deliveryFromProbe(probe([['dts'], ['ac3']]), tv)).toMatchObject({
      mode: 'direct',
      defaultAudioTrackIndex: 1,
    });
    // A browser that can't switch tracks keeps converting the default
    expect(
      deliveryFromProbe(
        probe([
          ['truehd', 'eng'],
          ['ac3', 'eng'],
        ]),
        { ...tv, nativeAudioTracks: false }
      ).mode
    ).toBe('audio-transcode');
  });

  it('selects a preferred language and only converts its unsupported codec', () => {
    const video = setupTest().streams[0];
    const probe = {
      format: { duration: '120' },
      streams: [
        video,
        {
          codec_type: 'audio',
          codec_name: 'aac',
          tags: { language: 'fra' },
          disposition: { default: 1 },
        },
        { codec_type: 'audio', codec_name: 'ac3', tags: { language: 'eng' } },
      ],
    };
    const chrome = deliveryFromProbe(probe, {
      audioLanguages: ['en-GB'],
      supportedAudioCodecs: ['aac'],
    });
    expect(chrome).toMatchObject({
      mode: 'audio-transcode',
      defaultAudioTrackIndex: 1,
      audioCodec: 'ac3',
    });
    expect(chrome.audioTracks?.[1].copyAudio).toBe(false);
    const tv = deliveryFromProbe(probe, {
      audioLanguages: ['en-GB'],
      supportedAudioCodecs: ['aac', 'ac3'],
      nativeAudioTracks: true,
    });
    expect(tv.mode).toBe('direct');
    expect(tv.audioTracks?.[1].copyAudio).toBe(true);
    const remux = deliveryFromProbe(probe, {
      audioLanguages: ['en-GB'],
      supportedAudioCodecs: ['aac', 'ac3'],
    });
    expect(remux.mode).toBe('audio-transcode');
    expect(remux.mimeType).toContain('ac-3');
    const mseFallback = deliveryFromProbe(probe, {
      audioLanguages: ['en'],
      supportedAudioCodecs: ['ac3'],
      supportedMseAudioCodecs: ['aac'],
    });
    expect(mseFallback.audioTracks?.[1]).toMatchObject({ canPlayDirect: true, copyAudio: false });
    expect(mseFallback.mimeType).toContain('mp4a.40.2');
    expect(audioConversionArgs('http://localhost/input', 0, 1, true)).toContain('copy');
    expect(audioConversionArgs('http://localhost/input', 0, 1, true)).not.toContain('aac');
  });

  it('builds a seekable, video-copy command with original timestamps', () => {
    const args = audioConversionArgs('http://127.0.0.1:1234/private-input', 45);
    expect(args.slice(args.indexOf('-ss'), args.indexOf('-i'))).toEqual([
      '-ss',
      '45',
      '-noaccurate_seek',
      '-copyts',
      '-start_at_zero',
    ]);
    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-ac'))).toEqual([
      '-c:v',
      'copy',
      '-c:a',
      'aac',
    ]);
    expect(args).toContain('delay_moov+frag_keyframe+default_base_moof');
    expect(args).not.toContain('libx264');
  });
});

describe('credits chapters', () => {
  const chapters = (...titles: Array<[number, string]>) => ({
    chapters: titles.map(([start, title]) => ({ start_time: String(start), tags: { title } })),
  });

  it('recognizes end-credits chapter titles', () => {
    expect(explicitCredits(chapters([0, 'Intro'], [5400, 'End Credits']), 5600)).toEqual({
      start: 5400,
    });
    expect(explicitCredits(chapters([0, 'Chapter 1'], [600, 'Credits']), 700)).toEqual({
      start: 600,
    });
  });

  it('ends the episode at an anime ED when only a preview follows it', () => {
    expect(
      explicitCredits(
        chapters(
          [0, 'Prologue'],
          [90, 'Opening'],
          [180, 'Part A'],
          [720, 'Part B'],
          [1290, 'Ending'],
          [1380, 'Preview']
        ),
        1420
      )
    ).toEqual({ start: 1290 });
    expect(
      explicitCredits(chapters([0, 'Part A'], [1300, 'ED'], [1390, 'Next Episode Preview']), 1420)
    ).toEqual({ start: 1300 });
  });

  it('resumes at a scene after the credits, past any preview in between', () => {
    // Tokyo Revengers S4E4 (DSNP WEB-DL) chapters
    expect(
      explicitCredits(
        chapters(
          [0, 'Prologue'],
          [114.031, 'Intro'],
          [203.954, 'Part1'],
          [1331.038, 'Credits'],
          [1421.002, 'Post-Credits']
        ),
        1469.051
      )
    ).toEqual({ start: 1331.038, end: 1421.002 });
    expect(
      explicitCredits(
        chapters([0, 'Part A'], [1200, 'Ending'], [1290, 'Preview'], [1320, 'Epilogue']),
        1420
      )
    ).toEqual({ start: 1200, end: 1320 });
  });

  it('never skips opening credits, the opening, or files without credits', () => {
    expect(
      explicitCredits(chapters([0, 'Credits'], [60, 'Part A'], [1300, 'Part B']), 1420)
    ).toBeUndefined();
    expect(explicitCredits(chapters([0, 'Opening'], [90, 'Part A']), 1420)).toBeUndefined();
    expect(explicitCredits({})).toBeUndefined();
  });

  it('orders chapters by start time', () => {
    expect(
      explicitCredits(chapters([1380, 'Preview'], [0, 'Part A'], [1290, 'Ending']), 1420)
    ).toEqual({ start: 1290 });
  });

  it('finds the opening, joining consecutive opening chapters', () => {
    // Tokyo Revengers S4E4 (DSNP WEB-DL) chapters
    expect(
      explicitIntro(
        chapters(
          [0, 'Prologue'],
          [114.031, 'Intro'],
          [203.954, 'Part1'],
          [1331.038, 'Credits'],
          [1421.002, 'Post-Credits']
        ),
        1469.051
      )
    ).toEqual({ start: 114.031, end: 203.954 });
    expect(
      explicitIntro(chapters([0, 'OP'], [60, 'Opening Credits'], [90, 'Part A']), 1420)
    ).toEqual({ start: 0, end: 90 });
  });

  it('ignores openings without an end, too long, or in the second half', () => {
    expect(explicitIntro(chapters([0, 'Part A'], [100, 'Opening']), 1420)).toBeUndefined();
    expect(explicitIntro(chapters([0, 'Intro'], [900, 'Part A']), 1420)).toBeUndefined();
    expect(
      explicitIntro(chapters([0, 'Part A'], [1000, 'Intro'], [1090, 'Part B']), 1420)
    ).toBeUndefined();
    expect(explicitIntro({})).toBeUndefined();
  });

  it('exposes the resume point on the delivery', () => {
    const delivery = deliveryFromProbe(
      {
        format: { duration: '1469.051' },
        chapters: chapters(
          [0, 'Prologue'],
          [114, 'Intro'],
          [204, 'Part1'],
          [1331, 'Credits'],
          [1421, 'Post-Credits']
        ).chapters,
        streams: [
          { codec_type: 'video', codec_name: 'h264', extradata: '\n00000000: 0164 0028 ffe1 00ab' },
          { codec_type: 'audio', codec_name: 'aac' },
        ],
      },
      { supportedAudioCodecs: ['aac'] }
    );
    expect(delivery).toMatchObject({
      creditsStartSeconds: 1331,
      creditsEndSeconds: 1421,
      introStartSeconds: 114,
      introEndSeconds: 204,
    });
  });
});

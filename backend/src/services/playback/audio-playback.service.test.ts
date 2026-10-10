import {
  audioConversionArgs,
  AudioPlaybackError,
  deliveryFromProbe,
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
    expect(delivery.audioTracks).toEqual([
      { index: 0, language: 'fra', title: null, codec: 'ac3', channels: 6, isDefault: false },
      { index: 1, language: 'eng', title: 'Original', codec: 'aac', channels: 2, isDefault: true },
    ]);
    expect(delivery.mode).toBe('audio-transcode');
    expect(audioConversionArgs('http://localhost/input', 45, 1)).toContain('0:a:1');
  });

  it('rejects missing duration and video that would require video transcoding', () => {
    expect(() => deliveryFromProbe({ ...setupTest(), format: { duration: 'NaN' } })).toThrow(
      AudioPlaybackError
    );
    expect(() => deliveryFromProbe(setupTest('ac3', 'hevc'))).toThrow('H.264');
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

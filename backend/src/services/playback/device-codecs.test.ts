import { deliveryFromProbe } from './audio-playback.service';
import { withDeviceCodecs } from './device-codecs';

describe('withDeviceCodecs', () => {
  const tv = {
    allowHevc: true,
    nativeHevcContainers: ['mp4', 'matroska'] as Array<'matroska' | 'mp4'>,
    supportedAudioCodecs: ['aac', 'mp3', 'ac3', 'eac3', 'flac'],
    nativeAudioTracks: true,
    supportedMseVideoCodecs: ['h264', 'hevc'] as Array<'h264' | 'hevc'>,
  };

  it('leaves preferences without a TV report unchanged', () => {
    expect(withDeviceCodecs(tv)).toBe(tv);
  });

  it('adds the reported audio codecs, in ffprobe names, to the listed ones', () => {
    const preferences = withDeviceCodecs({
      ...tv,
      tizenCodecs: { audio: ['TrueHD', 'OPUS'], video: ['H264', 'HEVC'] },
    });
    expect(preferences.supportedAudioCodecs).toEqual(
      expect.arrayContaining(['aac', 'flac', 'truehd', 'opus'])
    );
    expect(preferences.supportedVideoCodecs).toEqual(['h264', 'hevc']);
    expect(preferences.allowHevc).toBe(true);
    expect(preferences.nativeHevcContainers).toEqual(['mp4', 'matroska']);
  });

  it('drops H.265 for a TV that does not report HEVC', () => {
    const preferences = withDeviceCodecs({ ...tv, tizenCodecs: { audio: [], video: ['H264'] } });
    expect(preferences.allowHevc).toBe(false);
    expect(preferences.nativeHevcContainers).toEqual([]);
  });

  it('plays TrueHD as it is on a TV that reports it', () => {
    const probe = {
      format: { duration: '3558.7', format_name: 'matroska,webm' },
      streams: [
        {
          codec_type: 'video',
          codec_name: 'hevc',
          extradata: '00000000: 0102 2000 0000 9000 0000 0000 78f0 00fc',
        },
        { codec_type: 'audio', codec_name: 'truehd', channels: 6 },
      ],
    };
    expect(deliveryFromProbe(probe, tv).mode).toBe('audio-transcode');
    const reported = withDeviceCodecs({
      ...tv,
      tizenCodecs: { audio: ['TrueHD'], video: ['H264', 'HEVC'] },
    });
    expect(deliveryFromProbe(probe, reported).mode).toBe('direct');
  });

  it('does not play a video codec the TV leaves out', () => {
    const probe = {
      format: { duration: '120', format_name: 'matroska,webm' },
      streams: [
        { codec_type: 'video', codec_name: 'av1' },
        { codec_type: 'audio', codec_name: 'aac' },
      ],
    };
    expect(deliveryFromProbe(probe, tv).mode).toBe('direct');
    const reported = withDeviceCodecs({ ...tv, tizenCodecs: { audio: [], video: ['H264'] } });
    expect(() => deliveryFromProbe(probe, reported)).toThrow('cannot decode av1 video');
  });
});

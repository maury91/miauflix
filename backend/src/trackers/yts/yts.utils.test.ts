import { AudioCodec, VideoCodec } from '@utils/torrent-name-parser.util';

import {
  calculateApproximateBitrate,
  detectAudioCodecFromChannels,
  getResolutionFromQuality,
  mapYTSVideoCodec,
  normalizeYTSTorrent,
} from './yts.utils';

describe('YTS Utils', () => {
  describe('mapYTSVideoCodec', () => {
    it('should correctly map x264 codec', () => {
      expect(mapYTSVideoCodec('x264', '8')).toBe(VideoCodec.X264);
      expect(mapYTSVideoCodec('H.264', '8')).toBe(VideoCodec.X264);
    });

    it('should correctly map x265 codec with bit depth', () => {
      expect(mapYTSVideoCodec('x265', '8')).toBe(VideoCodec.X265);
      expect(mapYTSVideoCodec('HEVC', '10')).toBe(VideoCodec.X265_10BIT);
      expect(mapYTSVideoCodec('h.265', '10')).toBe(VideoCodec.X265_10BIT);
    });

    it('should correctly map AV1 codec with bit depth', () => {
      expect(mapYTSVideoCodec('AV1', '8')).toBe(VideoCodec.AV1);
      expect(mapYTSVideoCodec('AV1', '10')).toBe(VideoCodec.AV1_10BIT);
    });

    it('should correctly map other codecs', () => {
      expect(mapYTSVideoCodec('xvid', '8')).toBe(VideoCodec.XVID);
      expect(mapYTSVideoCodec('VP9', '8')).toBe(VideoCodec.VP9);
      expect(mapYTSVideoCodec('mpeg-2', '8')).toBe(VideoCodec.MPEG2);
      expect(mapYTSVideoCodec('divx', '8')).toBe(VideoCodec.MPEG4);
    });

    it('should return UNKNOWN for unrecognized codecs', () => {
      expect(mapYTSVideoCodec('unknown', '8')).toBe(VideoCodec.UNKNOWN);
    });
  });

  describe('detectAudioCodecFromChannels', () => {
    it('should detect audio codecs from channel information', () => {
      expect(detectAudioCodecFromChannels('atmos 7.1')).toBe(AudioCodec.ATMOS);
      expect(detectAudioCodecFromChannels('truehd 7.1')).toBe(AudioCodec.TRUEHD);
      expect(detectAudioCodecFromChannels('dts-hd ma 5.1')).toBe(AudioCodec.DTS_HDMA);
      expect(detectAudioCodecFromChannels('dts-hd 5.1')).toBe(AudioCodec.DTS_HD);
      expect(detectAudioCodecFromChannels('dts 5.1')).toBe(AudioCodec.DTS);
      expect(detectAudioCodecFromChannels('ddp 5.1')).toBe(AudioCodec.EAC3);
      expect(detectAudioCodecFromChannels('eac3 5.1')).toBe(AudioCodec.EAC3);
      expect(detectAudioCodecFromChannels('dd+ 5.1')).toBe(AudioCodec.EAC3);
      expect(detectAudioCodecFromChannels('ac3 5.1')).toBe(AudioCodec.AC3);
      expect(detectAudioCodecFromChannels('dolby digital 5.1')).toBe(AudioCodec.AC3);
      expect(detectAudioCodecFromChannels('aac 2.0')).toBe(AudioCodec.AAC);
      expect(detectAudioCodecFromChannels('flac 2.0')).toBe(AudioCodec.FLAC);
      expect(detectAudioCodecFromChannels('opus 5.1')).toBe(AudioCodec.OPUS);
      expect(detectAudioCodecFromChannels('mp3 2.0')).toBe(AudioCodec.MP3);
    });

    it('should return null for unrecognized audio information', () => {
      expect(detectAudioCodecFromChannels('2.0')).toBe(null);
      expect(detectAudioCodecFromChannels('5.1')).toBe(null);
      expect(detectAudioCodecFromChannels('7.1')).toBe(null);
    });
  });

  describe('getResolutionFromQuality', () => {
    it('should correctly parse quality strings', () => {
      expect(getResolutionFromQuality('2160p')).toEqual({
        width: 3840,
        height: 2160,
        label: '4K',
      });
      expect(getResolutionFromQuality('4k')).toEqual({
        width: 3840,
        height: 2160,
        label: '4K',
      });
      expect(getResolutionFromQuality('1080p')).toEqual({
        width: 1920,
        height: 1080,
        label: 'FHD',
      });
      expect(getResolutionFromQuality('720p')).toEqual({
        width: 1280,
        height: 720,
        label: 'HD',
      });
      expect(getResolutionFromQuality('480p')).toEqual({
        width: 854,
        height: 480,
        label: 'SD',
      });
    });

    it('should return unknown for unrecognized quality', () => {
      expect(getResolutionFromQuality('unknown')).toEqual({
        width: 0,
        height: 0,
        label: 'Unknown',
      });
    });
  });

  describe('calculateApproximateBitrate', () => {
    it('should calculate approximate bitrate correctly', () => {
      // 1GB file with 90 minutes duration = ~15,000 kbps
      const size = 1024 * 1024 * 1024; // 1GB in bytes
      const duration = 90; // 90 minutes
      const expectedBitrate = Math.round((size * 8) / (duration * 60) / 1000);

      expect(calculateApproximateBitrate(size, duration)).toBe(expectedBitrate);
    });

    it('should return 0 for invalid input', () => {
      expect(calculateApproximateBitrate(1000, 0)).toBe(0);
      expect(calculateApproximateBitrate(1000, -10)).toBe(0);
    });
  });

  describe('normalizeYTSTorrent', () => {
    it('should normalize YTS torrent data', () => {
      const torrent = {
        url: 'https://yts.mx/torrent/download/HASH123',
        hash: 'HASH123',
        quality: '1080p',
        type: 'bluray',
        is_repack: '0',
        video_codec: 'x265',
        bit_depth: '10',
        audio_channels: 'dts 5.1',
        seeds: 100,
        peers: 20,
        size: '2.5 GB',
        size_bytes: 2684354560, // 2.5 GB in bytes
        date_uploaded: '2023-05-15 10:30:45',
        date_uploaded_unix: 1684147845,
      };

      const result = normalizeYTSTorrent(torrent, 'Test Movie 2023', 120);

      expect(result.quality).toBe('1080p');
      expect(result.resolution).toEqual({
        width: 1920,
        height: 1080,
        label: 'FHD',
      });
      expect(result.source).toBe('bluray');
      expect(result.videoCodec).toBe(VideoCodec.X265_10BIT);
      expect(result.audioCodec).toBe(AudioCodec.DTS);
      expect(result.size).toEqual({
        value: 2.5,
        unit: 'GB',
        bytes: 2684354560,
      });
      expect(result.magnetLink).toContain('magnet:?xt=urn:btih:HASH123');
      expect(result.seeders).toBe(100);
      expect(result.leechers).toBe(20);
      expect(result.uploadDate).toBeInstanceOf(Date);
      expect(result.approximateBitrate).toBe(Math.round((2684354560 * 8) / (120 * 60) / 1000));
    });
  });
});

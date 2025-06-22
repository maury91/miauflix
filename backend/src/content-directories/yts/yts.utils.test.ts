import {
  AudioCodec,
  calculateApproximateBitrate,
  detectAudioCodecFromChannels,
  VideoCodec,
} from '@miauflix/source-metadata-extractor';

import { mapYTSVideoCodec } from './yts.utils';

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

    it('should return null for unrecognized codecs', () => {
      expect(mapYTSVideoCodec('unknown', '8')).toBe(null);
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
});

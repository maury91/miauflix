import { AudioCodec, VideoCodec } from '@miauflix/source-metadata-extractor';

/**
 * Normalize string codec values to VideoCodec enum
 */
export function normalizeVideoCodec(codec: VideoCodec | string): VideoCodec | null {
  if (Object.values(VideoCodec).includes(codec as VideoCodec)) {
    return codec as VideoCodec;
  }

  // Handle string values that need normalization
  const lower = codec.toLowerCase();

  // 10-bit variants first
  if (lower.includes('x265') && (lower.includes('10bit') || lower.includes('10-bit'))) {
    return VideoCodec.X265_10BIT;
  }
  if (lower.includes('x264') && (lower.includes('10bit') || lower.includes('10-bit'))) {
    return VideoCodec.X264_10BIT;
  }
  if (lower.includes('av1') && (lower.includes('10bit') || lower.includes('10-bit'))) {
    return VideoCodec.AV1_10BIT;
  }

  // Standard variants
  if (lower.includes('x265') || lower.includes('hevc') || lower.includes('h.265')) {
    return VideoCodec.X265;
  }
  if (lower.includes('x264') || lower.includes('h.264') || lower.includes('avc')) {
    return VideoCodec.X264;
  }
  if (lower.includes('av1')) {
    return VideoCodec.AV1;
  }
  if (lower.includes('vp9')) {
    return VideoCodec.VP9;
  }
  if (lower.includes('vp8')) {
    return VideoCodec.VP8;
  }
  if (lower.includes('xvid')) {
    return VideoCodec.XVID;
  }
  if (lower.includes('mpeg2') || lower.includes('mpeg-2')) {
    return VideoCodec.MPEG2;
  }
  if (lower.includes('mpeg4') || lower.includes('mpeg-4') || lower.includes('divx')) {
    return VideoCodec.MPEG4;
  }
  if (lower.includes('vc1') || lower.includes('vc-1')) {
    return VideoCodec.VC1;
  }

  return null;
}

/**
 * Normalize string codec values to AudioCodec enum
 */
export function normalizeAudioCodec(codec: AudioCodec | string): AudioCodec | null {
  if (Object.values(AudioCodec).includes(codec as AudioCodec)) {
    return codec as AudioCodec;
  }

  // Handle string values that need normalization
  const lower = codec.toLowerCase();

  if (lower.includes('truehd') || lower.includes('true-hd')) {
    return AudioCodec.TRUEHD;
  }
  if (lower.includes('atmos')) {
    return AudioCodec.ATMOS;
  }
  if (lower.includes('dts-hd-ma') || lower.includes('dts hd ma')) {
    return AudioCodec.DTS_HDMA;
  }
  if (lower.includes('dts-hd') || lower.includes('dts hd')) {
    return AudioCodec.DTS_HD;
  }
  if (lower.includes('dts')) {
    return AudioCodec.DTS;
  }
  if (
    lower.includes('eac3') ||
    lower.includes('e-ac3') ||
    lower.includes('dd+') ||
    lower.includes('ddp')
  ) {
    return AudioCodec.EAC3;
  }
  if (lower.includes('ac3') || lower.includes('dolby digital')) {
    return AudioCodec.AC3;
  }
  if (lower.includes('aac')) {
    return AudioCodec.AAC;
  }
  if (lower.includes('flac')) {
    return AudioCodec.FLAC;
  }
  if (lower.includes('mp3')) {
    return AudioCodec.MP3;
  }
  if (lower.includes('pcm') || lower.includes('lpcm')) {
    return AudioCodec.PCM;
  }
  if (lower.includes('opus')) {
    return AudioCodec.OPUS;
  }

  return null;
}

/**
 * Get quality bonus points for video codec
 */
export function getVideoCodecQualityBonus(codec: VideoCodec | string): number {
  const normalizedCodec = normalizeVideoCodec(codec);

  if (!normalizedCodec) {
    return 0;
  }

  switch (normalizedCodec) {
    case VideoCodec.X265:
    case VideoCodec.X265_10BIT:
      return 0.5;
    case VideoCodec.AV1:
    case VideoCodec.AV1_10BIT:
      return 0.4;
    case VideoCodec.X264:
    case VideoCodec.X264_10BIT:
      return 0.3;
    case VideoCodec.VP9:
      return 0.2;
    case VideoCodec.VP8:
    case VideoCodec.XVID:
    case VideoCodec.MPEG4:
      return 0.1;
    default:
      return 0;
  }
}

/**
 * Format video codec for display
 */
export function formatVideoCodec(codec: VideoCodec | string | null): string {
  const normalizedCodec = codec ? normalizeVideoCodec(codec) : null;

  if (!normalizedCodec) {
    return 'Unknown';
  }

  switch (normalizedCodec) {
    case VideoCodec.X264:
      return 'H.264';
    case VideoCodec.X264_10BIT:
      return 'H.264 (10-bit)';
    case VideoCodec.X265:
      return 'HEVC (H.265)';
    case VideoCodec.X265_10BIT:
      return 'HEVC (H.265 10-bit)';
    case VideoCodec.AV1:
      return 'AV1';
    case VideoCodec.AV1_10BIT:
      return 'AV1 (10-bit)';
    case VideoCodec.VP9:
      return 'VP9';
    case VideoCodec.VP8:
      return 'VP8';
    case VideoCodec.XVID:
      return 'XVID';
    case VideoCodec.MPEG2:
      return 'MPEG-2';
    case VideoCodec.MPEG4:
      return 'MPEG-4';
    case VideoCodec.VC1:
      return 'VC-1';
    default:
      return 'Unknown';
  }
}

/**
 * Format audio codec for display
 */
export function formatAudioCodec(codec: AudioCodec | string): string {
  const normalizedCodec = normalizeAudioCodec(codec);

  if (!normalizedCodec) {
    return 'Unknown';
  }

  switch (normalizedCodec) {
    case AudioCodec.AAC:
      return 'AAC';
    case AudioCodec.AC3:
      return 'Dolby Digital (AC3)';
    case AudioCodec.EAC3:
      return 'Dolby Digital Plus (E-AC3)';
    case AudioCodec.DTS:
      return 'DTS';
    case AudioCodec.DTS_HD:
      return 'DTS-HD';
    case AudioCodec.DTS_HDMA:
      return 'DTS-HD Master Audio';
    case AudioCodec.TRUEHD:
      return 'Dolby TrueHD';
    case AudioCodec.ATMOS:
      return 'Dolby Atmos';
    case AudioCodec.FLAC:
      return 'FLAC';
    case AudioCodec.MP3:
      return 'MP3';
    case AudioCodec.OPUS:
      return 'Opus';
    case AudioCodec.PCM:
      return 'PCM';
    default:
      return 'Unknown';
  }
}

import { AudioCodec, Quality } from '../types';

/**
 * Extracts resolution information from quality enum
 */
export function qualityToResolution(quality: Quality | undefined): {
  width: number;
  height: number;
  label: string;
} {
  switch (quality) {
    case Quality['8K']:
      return { width: 7680, height: 4320, label: '8K' };
    case Quality['4K']:
      return { width: 3840, height: 2160, label: '4K' };
    case Quality['2K']:
      return { width: 2560, height: 1440, label: '2K' };
    case Quality.FHD:
      return { width: 1920, height: 1080, label: 'FHD' };
    case Quality.HD:
      return { width: 1280, height: 720, label: 'HD' };
    default:
      return { width: 854, height: 480, label: 'SD' };
  }
}

/**
 * Calculates the approximate bitrate based on video size and duration
 * @param sizeBytes File size in bytes
 * @param durationMinutes Duration in minutes
 * @returns Approximate bitrate in kbps
 */
export function calculateApproximateBitrate(sizeBytes: number, durationMinutes: number): number {
  if (!durationMinutes || durationMinutes <= 0) return 0;

  // Convert duration to seconds
  const durationSeconds = durationMinutes * 60;

  // Calculate bitrate in bits per second
  const bitsPerSecond = (sizeBytes * 8) / durationSeconds;

  // Convert to kbps and round
  return Math.round(bitsPerSecond / 1000);
}

/**
 * Maps audio channel information to AudioCodec enum
 * @param audioChannels String containing audio channel information
 * @returns AudioCodec or null if no match found
 */
export function detectAudioCodecFromChannels(audioChannels: string): AudioCodec | null {
  if (audioChannels.includes('atmos')) {
    return AudioCodec.ATMOS;
  }

  if (audioChannels.includes('truehd')) {
    return AudioCodec.TRUEHD;
  }

  if (audioChannels.includes('dts-hd ma') || audioChannels.includes('dts-hdma')) {
    return AudioCodec.DTS_HDMA;
  }

  if (audioChannels.includes('dts-hd')) {
    return AudioCodec.DTS_HD;
  }

  if (audioChannels.includes('dts')) {
    return AudioCodec.DTS;
  }

  if (
    audioChannels.includes('dd+') ||
    audioChannels.includes('ddp') ||
    audioChannels.includes('eac3')
  ) {
    return AudioCodec.EAC3;
  }

  if (audioChannels.includes('ac3') || audioChannels.includes('dolby digital')) {
    return AudioCodec.AC3;
  }

  if (audioChannels.includes('aac')) {
    return AudioCodec.AAC;
  }

  if (audioChannels.includes('flac')) {
    return AudioCodec.FLAC;
  }

  if (audioChannels.includes('opus')) {
    return AudioCodec.OPUS;
  }

  if (audioChannels.includes('mp3')) {
    return AudioCodec.MP3;
  }

  return null;
}

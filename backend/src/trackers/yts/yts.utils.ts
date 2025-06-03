import { AudioCodec, VideoCodec } from '@utils/torrent-name-parser.util';

import type { Torrent } from './yts.types';

/**
 * Maps YTS video codec information to our internal VideoCodec enum
 */
export function mapYTSVideoCodec(codec: string, bitDepth: string): VideoCodec {
  const codecLower = codec.toLowerCase();
  const bitDepthNum = parseInt(bitDepth, 10);

  if (codecLower === 'x264' || codecLower === 'h.264') {
    return VideoCodec.X264;
  }

  if (codecLower === 'x265' || codecLower === 'h.265' || codecLower === 'hevc') {
    return bitDepthNum === 10 ? VideoCodec.X265_10BIT : VideoCodec.X265;
  }

  if (codecLower === 'av1') {
    return bitDepthNum === 10 ? VideoCodec.AV1_10BIT : VideoCodec.AV1;
  }

  if (codecLower === 'xvid') {
    return VideoCodec.XVID;
  }

  if (codecLower === 'vp9') {
    return VideoCodec.VP9;
  }

  if (codecLower === 'mpeg-2' || codecLower === 'mpeg2') {
    return VideoCodec.MPEG2;
  }

  if (codecLower === 'divx' || codecLower === 'mpeg-4' || codecLower === 'mpeg4') {
    return VideoCodec.MPEG4;
  }

  return VideoCodec.UNKNOWN;
}

/**
 * Maps YTS audio channel information to our internal AudioCodec enum
 */
export function detectAudioCodecFromChannels(audioChannels: string): AudioCodec | null {
  // YTS usually doesn't provide detailed audio codec info in the channel string
  // This is just a basic detection based on common patterns

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

/**
 * Extracts resolution information from YTS torrent quality
 */
export function getResolutionFromQuality(quality: string): {
  width: number;
  height: number;
  label: string;
} {
  const qualityLower = quality.toLowerCase();

  if (qualityLower === '2160p' || qualityLower === '4k') {
    return { width: 3840, height: 2160, label: '4K' };
  }

  if (qualityLower === '1080p') {
    return { width: 1920, height: 1080, label: 'FHD' };
  }

  if (qualityLower === '720p') {
    return { width: 1280, height: 720, label: 'HD' };
  }

  if (qualityLower === '480p') {
    return { width: 854, height: 480, label: 'SD' };
  }

  return { width: 0, height: 0, label: 'Unknown' };
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
 * Converts YTS torrent information to our internal format
 * @param torrent The YTS torrent object
 * @param movieTitle The movie title (for reference)
 * @param runtime Movie duration in minutes
 * @returns Normalized torrent information
 */
export function normalizeYTSTorrent(
  torrent: Torrent,
  movieTitle: string,
  runtime: number
): {
  approximateBitrate: number;
  audioCodec: AudioCodec | null;
  leechers: number;
  magnetLink: string;
  quality: string;
  resolution: { width: number; height: number; label: string };
  seeders: number;
  size: { value: number; unit: string; bytes: number };
  source: string;
  type: string;
  uploadDate: Date;
  url: string;
  videoCodec: VideoCodec;
} {
  const resolution = getResolutionFromQuality(torrent.quality);
  const videoCodec = mapYTSVideoCodec(torrent.video_codec, torrent.bit_depth);
  const audioCodec = detectAudioCodecFromChannels(torrent.audio_channels);

  // Parse size
  let sizeValue = 0;
  let sizeUnit = 'MB';
  const sizeMatch = torrent.size.match(/^([\d.]+)\s*(\w+)$/);
  if (sizeMatch) {
    sizeValue = parseFloat(sizeMatch[1]);
    sizeUnit = sizeMatch[2];
  }

  // Calculate bitrate
  const bitrate = calculateApproximateBitrate(torrent.size_bytes, runtime);

  return {
    approximateBitrate: bitrate,
    audioCodec,
    leechers: torrent.peers,
    magnetLink: `magnet:?xt=urn:btih:${torrent.hash}&dn=${encodeURIComponent(movieTitle)}`,
    quality: torrent.quality,
    resolution,
    seeders: torrent.seeds,
    size: {
      value: sizeValue,
      unit: sizeUnit,
      bytes: torrent.size_bytes,
    },
    source: torrent.type,
    type: torrent.type,
    uploadDate: new Date(torrent.date_uploaded),
    url: torrent.url,
    videoCodec,
  };
}

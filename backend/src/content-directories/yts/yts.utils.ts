import { Quality, Source, VideoCodec } from '@miauflix/source-metadata-extractor';

import type { YTSSourceMetadata } from './yts.types';

/**
 * Maps YTS video codec information to our internal VideoCodec enum
 */
export function mapYTSVideoCodec(codec: string, bitDepth: string): VideoCodec | null {
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

  return null;
}

export function mapYTSTypeToSource(type: string): Source | null {
  if (!type || typeof type !== 'string') {
    return null;
  }

  const normalizedType = type.toLowerCase().trim();

  // Blu-ray variants
  if (/blu-?ray|bdremux|bdrip|bd$/i.test(normalizedType)) {
    return Source.BLURAY;
  }

  // DVD variants
  if (/dvd|dvdrip|dvdscr$/i.test(normalizedType)) {
    return Source.DVD;
  }

  // Web variants (streaming/digital releases)
  if (/^web|webrip|web-dl|webdl|web-rip$/i.test(normalizedType)) {
    return Source.WEB;
  }

  // TV/HDTV variants
  if (/^tv|hdtv|pdtv|sdtv$/i.test(normalizedType)) {
    return Source.HDTV;
  }

  // Camera/theater recordings
  if (/^cam|ts|telesync|telecine|tc$/i.test(normalizedType)) {
    return Source.CAM;
  }

  // Screener variants
  if (/scr|screener|dvdscr$/i.test(normalizedType)) {
    return Source.DVD; // Screeners are typically DVD quality
  }

  // If no match found, return null
  return null;
}

const estimateQualityByCodecAndBitrate = (
  videoCodec: VideoCodec,
  bitrate: number
): Quality | null => {
  // Bitrate is expected in Mbps
  switch (videoCodec) {
    case VideoCodec.AV1:
    case VideoCodec.AV1_10BIT:
      if (bitrate >= 14) return Quality['8K'];
      if (bitrate >= 6) return Quality['4K'];
      if (bitrate >= 3.5) return Quality['2K'];
      if (bitrate >= 1.5) return Quality.FHD;
      if (bitrate >= 1) return Quality.HD;
      return Quality.SD;
    case VideoCodec.X265:
    case VideoCodec.X265_10BIT:
      if (bitrate >= 20) return Quality['8K'];
      if (bitrate >= 10) return Quality['4K'];
      if (bitrate >= 4.5) return Quality['2K'];
      if (bitrate >= 2) return Quality.FHD;
      if (bitrate >= 1.5) return Quality.HD;
      return Quality.SD;
    case VideoCodec.X264:
      if (bitrate >= 40) return Quality['8K'];
      if (bitrate >= 20) return Quality['4K'];
      if (bitrate >= 8) return Quality['2K'];
      if (bitrate >= 4.5) return Quality.FHD;
      if (bitrate >= 2.5) return Quality.HD;
      return Quality.SD;
    case VideoCodec.VP9:
      if (bitrate >= 16) return Quality['8K'];
      if (bitrate >= 8) return Quality['4K'];
      if (bitrate >= 4) return Quality['2K'];
      if (bitrate >= 1.8) return Quality.FHD;
      if (bitrate >= 1.2) return Quality.HD;
      return Quality.SD;
    case VideoCodec.XVID:
      if (bitrate >= 10) return Quality['4K'];
      if (bitrate >= 5) return Quality['2K'];
      if (bitrate >= 2.5) return Quality.FHD;
      if (bitrate >= 1.25) return Quality.HD;
      return Quality.SD;
    default:
      return null;
  }
};

export function mapYTSQuality(
  {
    bit_depth,
    quality,
    size_bytes,
    video_codec,
  }: Pick<YTSSourceMetadata, 'bit_depth' | 'quality' | 'size_bytes' | 'video_codec'>,
  runtimeInSeconds: number
): Quality | null {
  const qualityLower = quality.toLowerCase().trim();

  if (qualityLower === '3d') {
    return Quality.FHD;
  }

  if (qualityLower === '2160p' || qualityLower === '4k') {
    return Quality['4K'];
  }

  if (qualityLower === '1440p' || qualityLower === '2k') {
    return Quality['2K'];
  }

  if (qualityLower === '1080p' || qualityLower === 'fhd') {
    return Quality.FHD;
  }

  if (qualityLower === '720p' || qualityLower === 'hd') {
    return Quality.HD;
  }

  if (qualityLower === '480p' || qualityLower === 'sd') {
    return Quality.SD;
  }

  if (video_codec) {
    const videoCodec = mapYTSVideoCodec(video_codec, bit_depth);
    if (videoCodec) {
      const bitrateInMbps = (size_bytes * 8) / (runtimeInSeconds * 1000000);
      return estimateQualityByCodecAndBitrate(videoCodec, bitrateInMbps);
    }
  }

  return null;
}

import { Source, VideoCodec } from '@miauflix/source-metadata-extractor';

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

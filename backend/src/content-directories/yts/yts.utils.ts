import { VideoCodec } from '@miauflix/source-metadata-extractor';

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

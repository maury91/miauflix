import { VideoCodec } from '@/types';

export function isVideoCodec(value: string): value is VideoCodec {
  return Object.values(VideoCodec).includes(value as VideoCodec);
} /**
 * Check if this is video codec extraction by looking for VideoCodec enum values
 */
export function isVideoCodecExtraction(values: Set<unknown>): values is Set<VideoCodec> {
  return Array.from(values).some(value => typeof value === 'string' && isVideoCodec(value));
} /**
 * Combine video codecs with 10bit variants
 */
export function combineVideoCodecs(values: Set<VideoCodec>, has10bit: boolean): Set<VideoCodec> {
  const result = new Set<VideoCodec>();

  for (const value of values) {
    if (value === VideoCodec.X264 && has10bit) {
      result.add(VideoCodec.X264_10BIT);
    } else if (value === VideoCodec.X265 && has10bit) {
      result.add(VideoCodec.X265_10BIT);
    } else if (value === VideoCodec.AV1 && has10bit) {
      result.add(VideoCodec.AV1_10BIT);
    } else {
      result.add(value);
    }
  }

  return result;
}

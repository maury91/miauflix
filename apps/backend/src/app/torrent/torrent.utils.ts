import { GetTorrentFileData, VideoCodec, VideoQuality } from '@miauflix/types';
import { MIN_MB_MN } from './torrent.const';

import { getVideoCodec } from '../trackers/utils';

const supportedVideoExtensions = ['mkv', 'mp4', 'avi', 'ts', 'mov', 'webm'];
export const isValidVideoFile =
  (runtime: number, quality: VideoQuality, codecFromTorrentName: VideoCodec) =>
  <F extends { name: string; length: number }>({ name, length }: F) => {
    const ext = name.split('.').pop();
    if (!supportedVideoExtensions.includes(ext)) {
      return false;
    }
    const codecFromVideoName = getVideoCodec(name);
    const codec =
      codecFromVideoName.codec !== 'unknown'
        ? codecFromVideoName.codec
        : codecFromTorrentName;
    console.log(
      `[${codecFromVideoName}, ${codecFromTorrentName}][${quality}]`,
      MIN_MB_MN[quality][codec],
      length / (runtime * 1024 * 1024)
    );
    return length > MIN_MB_MN[quality][codec] * runtime * 1024 * 1024;
  };
export type GetTorrentFileDataWithIndex = GetTorrentFileData & {
  index: number;
};
const FROM_LIST_BASE_PRIORITY = 1000;

export function calculatePriority(
  {
    hevc,
    highQuality,
    index,
  }: Omit<GetTorrentFileDataWithIndex, 'mediaId' | 'mediaType' | 'runtime'>,
  basePriority = FROM_LIST_BASE_PRIORITY
) {
  if (hevc) {
    if (highQuality) {
      // This one has the highest importance
      return basePriority + index * 2;
    }
    // Lowest importance
    return basePriority + index * 2 + Math.floor(basePriority * 0.5);
  }
  if (!highQuality) {
    // We still prioritize high quality even if it's potentially slow
    return basePriority + index * 2 + Math.floor(basePriority * 0.1);
  }
  return basePriority + index * 2 + Math.floor(basePriority * 0.2);
}

export function calculateJobId({
  hevc,
  highQuality,
  mediaId,
  mediaType,
}: Omit<GetTorrentFileData, 'runtime'>) {
  return `gtf_${hevc ? 'H' : 'x'}${
    highQuality ? 'Q' : 'x'
  }_${mediaId}_${mediaType}`;
}

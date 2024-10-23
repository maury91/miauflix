import { VideoCodec, VideoQuality } from '@miauflix/types';
import { MIN_MB_MN } from './torrent.const';
import { getVideoCodec } from '../jackett/jackett.utils';

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
      codecFromVideoName !== 'unknown'
        ? codecFromVideoName
        : codecFromTorrentName;
    console.log(MIN_MB_MN[quality][codec], length / (runtime * 1024 * 1024));
    return length > MIN_MB_MN[quality][codec] * runtime * 1024 * 1024;
  };

import { VideoQuality } from '../jackett/jackett.types';
import { MIN_MB_MN } from './torrent.const';

const supportedVideoExtensions = ['mkv', 'mp4', 'avi'];
export const isValidVideoFile =
  (runtime: number, quality: VideoQuality) =>
  <F extends { name: string; length: number }>({ name, length }: F) => {
    const ext = name.split('.').pop();
    if (!supportedVideoExtensions.includes(ext)) {
      return false;
    }
    console.log(MIN_MB_MN[quality][ext], length / (runtime * 1024 * 1024));
    return length > MIN_MB_MN[quality][ext] * runtime * 1024 * 1024;
  };

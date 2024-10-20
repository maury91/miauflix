import { VideoQuality } from '../jackett/jackett.types';

export const allVideoQualities: VideoQuality[] = [
  360, 480, 720, 1080, 1440, 2160,
];

export const MIN_MB_MN: Record<
  VideoQuality,
  Record<'mkv' | 'mp4' | 'avi', number>
> = {
  '360': { mkv: 0.7, mp4: 1, avi: 1 },
  '480': { mkv: 1, mp4: 1.5, avi: 1.5 },
  '720': { mkv: 3.5, mp4: 5, avi: 5 },
  '1080': { mkv: 7, mp4: 10, avi: 10 },
  '1440': { mkv: 14, mp4: 20, avi: 20 },
  '2160': { mkv: 28, mp4: 40, avi: 40 },
};

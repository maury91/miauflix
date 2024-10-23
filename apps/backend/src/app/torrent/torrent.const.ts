import { VideoSource } from '../jackett/jackett.types';
import { VideoCodec, VideoQuality } from '@miauflix/types';

export const allVideoQualities: VideoQuality[] = [
  360, 480, 720, 1080, 1440, 2160,
];

export const MIN_MB_MN: Record<VideoQuality, Record<VideoCodec, number>> = {
  '360': {
    x265: 0.5,
    'x265 10bit': 0.4,
    x264: 0.5,
    'x264 10bit': 0.4,
    AV1: 0.5,
    'AV1 10bit': 0.4,
    XVid: 1,
    unknown: 0.5,
  },
  '480': {
    x265: 1,
    'x265 10bit': 1,
    x264: 1.5,
    'x264 10bit': 1,
    AV1: 1,
    'AV1 10bit': 1,
    XVid: 3,
    unknown: 1,
  },
  '720': {
    x265: 2.5,
    'x265 10bit': 2,
    x264: 3,
    'x264 10bit': 2.5,
    AV1: 2.5,
    'AV1 10bit': 2,
    XVid: 9,
    unknown: 2.5,
  },
  '1080': {
    x265: 4,
    'x265 10bit': 3.5,
    x264: 5,
    'x264 10bit': 4,
    AV1: 4,
    'AV1 10bit': 3.5,
    XVid: 10,
    unknown: 4,
  },
  '1440': {
    x265: 8,
    'x265 10bit': 7,
    x264: 11,
    'x264 10bit': 10,
    AV1: 8,
    'AV1 10bit': 7,
    XVid: 20,
    unknown: 8,
  },
  '2160': {
    x265: 11,
    'x265 10bit': 10,
    x264: 14,
    'x264 10bit': 13,
    AV1: 12,
    'AV1 10bit': 11,
    XVid: 30,
    unknown: 11,
  },
};

/// To be moved to settings

export const CODEC_PRIORITY: VideoCodec[] = [
  'AV1',
  'AV1 10bit',
  'x265',
  'x265 10bit',
  'x264',
  'x264 10bit',
  'XVid',
  'unknown',
];

export const UNIFY_10_BIT_CODECS = true;

export const QUALITY_PRIORITY: VideoQuality[] = [
  2160, 1440, 1080, 720, 480, 360,
];
export const EXCLUDED_QUALITIES: VideoQuality[] = [720, 480, 360];

export const SOURCE_PRIORITY: VideoSource[] = [
  'Blu-ray',
  'WEB',
  'HDTV',
  'DVD',
  'TS',
  'Cam',
  'unknown',
];

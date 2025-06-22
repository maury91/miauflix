/**
 * Output types for extracted metadata
 */

export interface ExtractedSourceMetadata {
  title: string;
  description?: string;
  year?: number;
  audioCodec: AudioCodec[];
  videoCodec: VideoCodec[];
  quality?: Quality;
  source?: Source;
  language: Language[];
  season?: number;
  episode?: number;
  confidence: ConfidenceScore;
}

export interface ConfidenceScore {
  overall: number;
  quality: number;
  videoCodec: number;
  audioCodec: number;
  source: number;
  language: number;
  tvData: number;
  year: number;
}

export interface ExtractionMethod {
  component: string;
  method: string;
  confidence: number;
}

export enum AudioCodec {
  ATMOS = 'ATMOS',
  TRUEHD = 'TRUEHD',
  DTS_HDMA = 'DTS_HDMA',
  DTS_HD = 'DTS_HD',
  DTS = 'DTS',
  EAC3 = 'EAC3',
  AC3 = 'AC3',
  AAC = 'AAC',
  FLAC = 'FLAC',
  MP3 = 'MP3',
  PCM = 'PCM',
  OPUS = 'OPUS',
}

export enum VideoCodec {
  X265_10BIT = 'X265_10BIT',
  X264_10BIT = 'X264_10BIT',
  AV1_10BIT = 'AV1_10BIT',
  X265 = 'X265',
  X264 = 'X264',
  AV1 = 'AV1',
  XVID = 'XVID',
  VP9 = 'VP9',
  VP8 = 'VP8',
  MPEG2 = 'MPEG2',
  MPEG4 = 'MPEG4',
  VC1 = 'VC1',
}

export enum Quality {
  '8K' = '8K',
  '4K' = '4K',
  '2K' = '2K',
  FHD = 'FHD',
  HD = 'HD',
  SD = 'SD',
}

export enum Source {
  WEB = 'WEB',
  BLURAY = 'BLURAY',
  HDTV = 'HDTV',
  DVD = 'DVD',
  TS = 'TS',
  CAM = 'CAM',
}

export enum Language {
  ENGLISH = 'ENGLISH',
  FRENCH = 'FRENCH',
  SPANISH = 'SPANISH',
  GERMAN = 'GERMAN',
  ITALIAN = 'ITALIAN',
  PORTUGUESE = 'PORTUGUESE',
  DUTCH = 'DUTCH',
  SWEDISH = 'SWEDISH',
  CZECH = 'CZECH',
  SLOVAK = 'SLOVAK',
  CHINESE = 'CHINESE',
  JAPANESE = 'JAPANESE',
  KOREAN = 'KOREAN',
  MULTI = 'MULTI',
}

import type { AudioCodec, VideoCodec } from '@miauflix/source-metadata-extractor';

import { formatAudioCodec, formatVideoCodec } from '@utils/codec.util';

/**
 * Public interface for media sources
 */
export interface MediaSource {
  id: number;
  qualityScore: number; // 1-5
  confidence: number; // 0-1
  resolution: string; // "1080p"
  estimatedSize: string; // "~2.1GB"
  videoFormat: string; // "H.264"
  audioFormat: string; // "AAC"
  availability: string; // "High/Medium/Low"
  uploadDate?: string; // ISO date string
  // NO sensitive data
}

/**
 * Extended interface for internal processing (not exposed to public API)
 */
export interface MediaSourceInternal extends MediaSource {
  resourceIdentifier: string; // Encrypted hash
  resourceLink: string; // Encrypted magnet link
  hasDataFile: boolean;
  availabilityMetrics: number; // Raw availability count
}

/**
 * DTO for transforming between internal MovieSource entity and public MediaSource
 */
export class MediaSourceMapper {
  /**
   * Transform internal MovieSource to public MediaSource
   */
  static toPublicMediaSource(
    internal: MediaSourceInternal,
    qualityScore: number,
    confidence: number,
    availability: string,
    estimatedSize: string
  ): MediaSource {
    return {
      id: internal.id,
      qualityScore,
      confidence,
      resolution: internal.resolution,
      estimatedSize,
      videoFormat: internal.videoFormat,
      audioFormat: internal.audioFormat,
      availability,
      uploadDate: internal.uploadDate,
    };
  }

  /**
   * Extract resolution from resolution number (height in pixels)
   */
  static formatResolution(resolutionHeight: number): string {
    if (resolutionHeight >= 2160) return '2160p (4K)';
    if (resolutionHeight >= 1440) return '1440p (2K)';
    if (resolutionHeight >= 1080) return '1080p (Full HD)';
    if (resolutionHeight >= 720) return '720p (HD)';
    if (resolutionHeight >= 480) return '480p (SD)';
    if (resolutionHeight >= 360) return '360p';
    if (resolutionHeight >= 240) return '240p';
    return `${resolutionHeight}p`;
  }

  /**
   * Format video codec for display using shared utility
   */
  static formatVideoCodec(codec: VideoCodec | string): string {
    return formatVideoCodec(codec);
  }

  /**
   * Format audio codec for display using shared utility
   */
  static formatAudioCodec(codec: AudioCodec | string): string {
    return formatAudioCodec(codec);
  }
}

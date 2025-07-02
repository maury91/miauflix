import type { AudioCodec, VideoCodec } from '@miauflix/source-metadata-extractor';
import { Quality } from '@miauflix/source-metadata-extractor';

import { formatAudioCodec, formatVideoCodec } from '@utils/codec.util';

/**
 * Public interface for media sources
 */
export interface MediaSource {
  id: number;
  qualityScore: number; // 1-5
  confidence: number; // 0-1
  quality: Quality | null; // "1080p"
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
      quality: internal.quality,
      estimatedSize,
      videoFormat: internal.videoFormat,
      audioFormat: internal.audioFormat,
      availability,
      uploadDate: internal.uploadDate,
    };
  }

  /**
   * Format quality for display using shared utility
   */
  static formatQuality(quality: Quality | '3D' | null): string {
    switch (quality) {
      case Quality['8K']:
        return '2160p (4K)';
      case Quality['4K']:
        return '1440p (2K)';
      case '3D':
        return '1080p (3D)';
      case Quality.FHD:
        return '1080p (Full HD)';
      case Quality.HD:
        return '720p (HD)';
      case Quality.SD:
        return '480p (SD)';
      case Quality.SD:
        return '360p';
      default:
        return 'Unknown';
    }
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

import type { AudioCodec, VideoCodec } from '@miauflix/source-metadata-extractor';

import { getVideoCodecQualityBonus } from '@utils/codec.util';

export interface QualityMetrics {
  resolution: string;
  videoCodec: VideoCodec | null;
  audioCodec?: AudioCodec | string;
  sourceType: string | null;
  fileSize: number;
  availability: number;
}

export interface QualityScore {
  score: number; // 1-5 scale
  confidence: number; // 0-1 scale
  availability: 'High' | 'Low' | 'Medium';
}

export class QualityScoringService {
  /**
   * Calculate quality score based on media source metrics
   */
  public calculateQualityScore(metrics: QualityMetrics): QualityScore {
    let score = 1;
    let confidence = 0.5;

    // Source type scoring (1-5 base score)
    const sourceTypeScore = this.getSourceTypeScore(metrics.sourceType);
    score = sourceTypeScore;

    // Resolution bonus (up to +1.5 points)
    const resolutionBonus = this.getResolutionBonus(metrics.resolution);
    score += resolutionBonus;

    // Video codec bonus (up to +0.5 points)
    const codecBonus = getVideoCodecQualityBonus(metrics.videoCodec);
    score += codecBonus;

    // File size optimization (can reduce score by up to -1 point)
    const sizeAdjustment = this.getSizeQualityAdjustment(metrics.fileSize, metrics.resolution);
    score += sizeAdjustment;

    // Ensure score stays within bounds
    score = Math.max(1, Math.min(5, score));

    // Calculate confidence based on availability and completeness of data
    confidence = this.calculateConfidence(metrics);

    // Determine availability level
    const availability = this.determineAvailability(metrics.availability);

    return {
      score: Math.round(score * 10) / 10, // Round to 1 decimal place
      confidence: Math.round(confidence * 100) / 100, // Round to 2 decimal places
      availability,
    };
  }

  /**
   * Get base score for source type
   */
  private getSourceTypeScore(sourceType: string | null): number {
    if (!sourceType) return 2.5;

    const type = sourceType.toLowerCase();

    // Map source types to quality scores
    if (type.includes('bluray') || type.includes('blu-ray')) return 5;
    if (type.includes('web-dl') || type.includes('webdl')) return 4.5;
    if (type.includes('webrip') || type.includes('web-rip')) return 4;
    if (type.includes('hdtv')) return 3.5;
    if (type.includes('dvdrip') || type.includes('dvd')) return 3;
    if (type.includes('ts') || type.includes('telesync')) return 2;
    if (type.includes('cam') || type.includes('camrip')) return 1;

    // Default for unknown types
    return 2.5;
  }

  /**
   * Get resolution bonus points
   */
  private getResolutionBonus(resolution: string): number {
    const res = resolution.toLowerCase();

    if (res.includes('2160p') || res.includes('4k')) return 1.5;
    if (res.includes('1440p')) return 1.2;
    if (res.includes('1080p')) return 1.0;
    if (res.includes('720p')) return 0.5;
    if (res.includes('480p')) return 0.2;

    return 0;
  }

  /**
   * Adjust score based on file size relative to expected size for resolution
   */
  private getSizeQualityAdjustment(fileSize: number, resolution: string): number {
    const expectedSize = this.getExpectedFileSize(resolution);
    if (expectedSize === 0) return 0;

    const ratio = fileSize / expectedSize;

    // Severely undersized files likely have poor quality
    if (ratio < 0.3) return -1.0;
    if (ratio < 0.5) return -0.5;
    if (ratio < 0.7) return -0.2;

    // Optimal size range
    if (ratio >= 0.7 && ratio <= 2.0) return 0;

    // Oversized files might be better quality but could be inefficient
    if (ratio > 2.0 && ratio <= 3.0) return 0.1;
    if (ratio > 3.0) return -0.1;

    return 0;
  }

  /**
   * Get expected file size in bytes for resolution
   */
  private getExpectedFileSize(resolution: string): number {
    const res = resolution.toLowerCase();

    // Expected sizes for 90-120 minute movies (in bytes)
    if (res.includes('2160p') || res.includes('4k')) return 8 * 1024 * 1024 * 1024; // 8GB
    if (res.includes('1440p')) return 4 * 1024 * 1024 * 1024; // 4GB
    if (res.includes('1080p')) return 2 * 1024 * 1024 * 1024; // 2GB
    if (res.includes('720p')) return 1 * 1024 * 1024 * 1024; // 1GB
    if (res.includes('480p')) return 0.7 * 1024 * 1024 * 1024; // 700MB

    return 0;
  }

  /**
   * Calculate confidence score based on data completeness and availability
   */
  private calculateConfidence(metrics: QualityMetrics): number {
    let confidence = 0.5; // Base confidence

    // Higher availability increases confidence
    if (metrics.availability > 50) confidence += 0.3;
    else if (metrics.availability > 10) confidence += 0.2;
    else if (metrics.availability > 0) confidence += 0.1;
    else confidence -= 0.2; // No availability data reduces confidence

    // Known source types increase confidence
    const knownSourceTypes = ['bluray', 'web-dl', 'webrip', 'hdtv', 'dvdrip', 'cam'];
    const hasKnownType = knownSourceTypes.some(type =>
      metrics.sourceType?.toLowerCase().includes(type)
    );
    if (hasKnownType) confidence += 0.1;

    // Standard resolutions increase confidence
    const standardRes = ['2160p', '1440p', '1080p', '720p', '480p'];
    const hasStandardRes = standardRes.some(res => metrics.resolution.toLowerCase().includes(res));
    if (hasStandardRes) confidence += 0.1;

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Determine availability level based on availability metrics
   */
  private determineAvailability(availability: number): 'High' | 'Low' | 'Medium' {
    if (availability >= 20) return 'High';
    if (availability >= 5) return 'Medium';
    return 'Low';
  }

  /**
   * Format file size for display
   */
  public formatFileSize(bytes: number): string {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);

    return `~${Math.round(size * 10) / 10} ${sizes[i]}`;
  }
}

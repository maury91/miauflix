import {
  type MediaSource,
  type MediaSourceInternal,
  MediaSourceMapper,
} from '@dto/media-source.dto';
import { AudioCodec, type VideoCodec } from '@miauflix/source-metadata-extractor';

import type { MovieSource } from '@entities/movie-source.entity';
import { formatAudioCodec, formatVideoCodec } from '@utils/codec.util';

import { type QualityMetrics, QualityScoringService } from './quality-scoring.service';

export class DtoService {
  private readonly qualityScoringService: QualityScoringService;

  constructor() {
    this.qualityScoringService = new QualityScoringService();
  }

  /**
   * Transform internal MovieSource entities to sanitized MediaSource objects
   * This is the main abstraction point that removes all torrent terminology
   */
  public transformToSanitizedSources(movieSources: MovieSource[]): MediaSource[] {
    return movieSources.map(source => this.transformSingleSource(source));
  }

  /**
   * Transform a single MovieSource to sanitized MediaSource
   */
  private transformSingleSource(source: MovieSource): MediaSource {
    // Create internal representation with sanitized field names
    const internal: MediaSourceInternal = {
      id: source.id,
      qualityScore: 0, // Will be calculated
      confidence: 0, // Will be calculated
      resolution: MediaSourceMapper.formatResolution(source.resolution),
      estimatedSize: this.qualityScoringService.formatFileSize(source.size),
      videoFormat: formatVideoCodec(source.videoCodec),
      audioFormat: this.determineAudioFormat(source),
      availability: 'Medium', // Will be calculated
      uploadDate: source.sourceUploadedAt?.toISOString(),
      resourceIdentifier: source.hash, // Encrypted in entity
      resourceLink: source.magnetLink, // Encrypted in entity
      hasDataFile: !!source.file,
      availabilityMetrics: this.calculateAvailabilityMetrics(source),
    };

    // Calculate quality score using the quality scoring service
    const qualityMetrics: QualityMetrics = {
      resolution: internal.resolution,
      videoCodec: source.videoCodec as VideoCodec,
      sourceType: source.sourceType,
      fileSize: source.size,
      availability: internal.availabilityMetrics,
    };

    const qualityScore = this.qualityScoringService.calculateQualityScore(qualityMetrics);

    // Return sanitized public interface
    return MediaSourceMapper.toPublicMediaSource(
      internal,
      qualityScore.score,
      qualityScore.confidence,
      qualityScore.availability,
      internal.estimatedSize
    );
  }

  /**
   * Determine audio format from source data
   * Falls back to AAC if no specific audio codec is available
   */
  private determineAudioFormat(source: MovieSource): string {
    // Try to extract audio codec from quality string or other metadata
    const quality = source.quality?.toLowerCase() || '';

    if (quality.includes('atmos')) return formatAudioCodec(AudioCodec.ATMOS);
    if (quality.includes('truehd')) return formatAudioCodec(AudioCodec.TRUEHD);
    if (quality.includes('dts')) return formatAudioCodec(AudioCodec.DTS);
    if (quality.includes('ac3')) return formatAudioCodec(AudioCodec.AC3);
    if (quality.includes('aac')) return formatAudioCodec(AudioCodec.AAC);

    // Default fallback
    return formatAudioCodec(AudioCodec.AAC);
  }

  /**
   * Calculate availability metrics from seeders/leechers data
   * Maps "broadcasters/watchers" to neutral availability metrics
   */
  private calculateAvailabilityMetrics(source: MovieSource): number {
    const broadcasters = source.broadcasters || 0;
    const watchers = source.watchers || 0;

    // Combine broadcasters and watchers for availability score
    // Broadcasters are weighted more heavily as they indicate active distribution
    return broadcasters * 2 + watchers;
  }

  /**
   * Get internal source data for streaming (used by streaming services)
   * This method should only be called by internal services, never exposed to public API
   */
  public getInternalSourceData(
    sourceId: number,
    movieSources: MovieSource[]
  ): {
    resourceLink: string;
    resourceIdentifier: string;
    hasDataFile: boolean;
  } | null {
    const source = movieSources.find(s => s.id === sourceId);
    if (!source) return null;

    return {
      resourceLink: source.magnetLink, // Encrypted in entity
      resourceIdentifier: source.hash, // Encrypted in entity
      hasDataFile: !!source.file,
    };
  }

  /**
   * Filter sources by minimum quality score
   */
  public filterByQuality(sources: MediaSource[], minScore: number): MediaSource[] {
    return sources.filter(source => source.qualityScore >= minScore);
  }

  /**
   * Sort sources by quality score (highest first)
   */
  public sortByQuality(sources: MediaSource[]): MediaSource[] {
    return [...sources].sort((a, b) => b.qualityScore - a.qualityScore);
  }

  /**
   * Filter sources by availability level
   */
  public filterByAvailability(
    sources: MediaSource[],
    minLevel: 'High' | 'Low' | 'Medium'
  ): MediaSource[] {
    const levelOrder = { Low: 0, Medium: 1, High: 2 };
    const minLevelValue = levelOrder[minLevel];

    return sources.filter(
      source => levelOrder[source.availability as keyof typeof levelOrder] >= minLevelValue
    );
  }
}

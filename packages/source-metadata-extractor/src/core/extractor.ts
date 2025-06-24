import {
  SourceMetadataInput,
  ExtractedSourceMetadata,
  AudioCodec,
  VideoCodec,
  Quality,
  Source,
  Language,
} from '@/types';
import {
  QUALITY_PATTERNS,
  FALLBACK_QUALITY_PATTERNS,
  VIDEO_CODEC_PATTERNS,
  AUDIO_CODEC_PATTERNS,
  SOURCE_PATTERNS,
  LANGUAGE_PATTERNS,
  YEAR_PATTERNS,
  TECHNICAL_CLEANUP_PATTERNS,
} from '@/patterns';

// Import our modular components
import { WorkingText, extractCleanTitleFromSegments } from './title-extractor';
import { ExtractionDetails, extractValue, extractTvData } from './extractors';
import { estimateQuality } from './estimate-quality';
import { calculateComplexity, calculateDynamicConfidence } from './confidence-calculator';
import { applyCleanupPatterns } from './pattern-matcher';

/**
 * Extract metadata from source information
 */
/**
 * Future Implementation Note:
 * Tracker-specific enhancements should be processed here.
 * Use the `input.trackerEnhancements` field to apply custom logic for each tracker.
 * Example steps:
 * 1. Validate the `trackerEnhancements` input.
 * 2. Apply tracker-specific patterns or rules to `workingText`.
 * 3. Integrate results into the `extractionDetails` object.
 * 4. Ensure tracker-specific metadata is included in the final output.
 */

export function extractSourceMetadata(
  input: SourceMetadataInput & { trackerEnhancements?: any }
): ExtractedSourceMetadata {
  const workingText: WorkingText = {
    title: input.name,
    description: input.description || '',
    titleSegments: [
      {
        start: 0,
        end: input.name.length,
      },
    ],
    descriptionSegments: [
      {
        start: 0,
        end: input.description ? input.description.length : 0,
      },
    ],
  };

  const extractionDetails: ExtractionDetails = {
    tvData: { found: false, specificity: 0 },
    year: { found: false, specificity: 0 },
    quality: { found: false, specificity: 0 },
    videoCodec: { found: false, specificity: 0, count: 0 },
    audioCodecs: { found: false, specificity: 0, count: 0 },
    source: { found: false, specificity: 0 },
    languages: { found: false, specificity: 0, count: 0 },
    titleLength: input.name.length,
    originalComplexity: calculateComplexity(input.name),
  };

  // Progressive extraction - each function extracts AND removes patterns
  const tvDataResult = extractTvData(workingText, extractionDetails);

  const yearResult = extractValue<string>(
    workingText,
    YEAR_PATTERNS,
    extractionDetails.year,
    false
  );

  let qualityResult = extractValue<Quality>(
    workingText,
    QUALITY_PATTERNS,
    extractionDetails.quality,
    false
  );

  const videoCodecResult = extractValue<VideoCodec>(
    workingText,
    VIDEO_CODEC_PATTERNS,
    extractionDetails.videoCodec,
    true
  );

  const audioCodecsResult = extractValue<AudioCodec>(
    workingText,
    AUDIO_CODEC_PATTERNS,
    extractionDetails.audioCodecs,
    true
  );

  const sourceResult = extractValue<Source>(
    workingText,
    SOURCE_PATTERNS,
    extractionDetails.source,
    false
  );

  const languagesResult = extractValue<Language>(
    workingText,
    LANGUAGE_PATTERNS,
    extractionDetails.languages,
    true
  );

  // Apply technical cleanup patterns to remove remaining unwanted terms
  applyCleanupPatterns(workingText, TECHNICAL_CLEANUP_PATTERNS);

  // Fallback quality detection for standalone numbers (lower confidence)
  if (!qualityResult) {
    qualityResult = extractValue<Quality>(
      workingText,
      FALLBACK_QUALITY_PATTERNS,
      extractionDetails.quality,
      false
    );
  }

  // Runtime-based quality estimation when quality is not found in name
  if (!qualityResult && input.trackerMetadata?.runtime) {
    const estimatedQuality = estimateQuality(
      input.size,
      input.trackerMetadata.runtime,
      videoCodecResult
    );
    if (estimatedQuality) {
      qualityResult = estimatedQuality;
      extractionDetails.quality.found = true;
      extractionDetails.quality.specificity = 30; // Lower confidence for estimated quality
    }
  }

  // Intelligent title extraction using segment analysis
  const cleanTitle = extractCleanTitleFromSegments(workingText, input.name);

  const confidence = calculateDynamicConfidence(extractionDetails);

  return {
    title: cleanTitle,
    description: workingText.description,
    year: yearResult !== null ? parseInt(yearResult, 10) : undefined,
    audioCodec: audioCodecsResult,
    videoCodec: videoCodecResult,
    quality: qualityResult || undefined,
    source: sourceResult || undefined,
    language: languagesResult,
    season: tvDataResult.season || undefined,
    episode: tvDataResult.episode || undefined,
    confidence,
  };
}

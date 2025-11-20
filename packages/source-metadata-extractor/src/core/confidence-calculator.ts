/**
 * Confidence scoring logic for metadata extraction
 */

import { ExtractionDetails } from './extractors';

import { ConfidenceScore } from '@/types';

/**
 * Calculate complexity score for a title
 */
export function calculateComplexity(title: string): number {
  let complexity = 0;

  if (/(2160p|1440p|1080p|720p|480p|4k|uhd|fhd|hd|sd)/i.test(title)) complexity += 20;
  if (/(x264|x265|hevc|av1|xvid)/i.test(title)) complexity += 15;
  if (/(dts|ac3|aac|truehd|atmos|flac)/i.test(title)) complexity += 15;
  if (/(bluray|webrip|hdtv|dvdrip)/i.test(title)) complexity += 10;
  if (/-[A-Z0-9]+$/i.test(title)) complexity += 10;
  if (/[sS]\d{1,2}[eE]\d{1,3}|\d{1,2}[xX]\d{2,3}/.test(title)) complexity += 15;
  if (/(eng|french|spanish|german|italian)/i.test(title)) complexity += 5;
  if (/\b(19\d{2}|20\d{2})\b/.test(title)) complexity += 10;

  const specialChars = (title.match(/[._-]/g) || []).length;
  complexity += Math.min(specialChars * 2, 20);

  return Math.min(complexity, 100);
}

/**
 * Calculate dynamic confidence scores based on extraction details
 */
export function calculateDynamicConfidence(details: ExtractionDetails): ConfidenceScore {
  const complexityFactor = Math.min(details.originalComplexity / 100, 1);
  const titleLengthFactor = Math.min(details.titleLength / 50, 1);

  const tvDataConf = details.tvData.found
    ? Math.round(details.tvData.specificity * complexityFactor)
    : 0;

  const yearConf = details.year.found ? Math.round(details.year.specificity * complexityFactor) : 0;

  const qualityConf = details.quality.found
    ? Math.round(details.quality.specificity * complexityFactor)
    : 0;

  const videoCodecConf = details.videoCodec.found
    ? Math.round(details.videoCodec.specificity * complexityFactor)
    : 0;

  const audioCodecConf = details.audioCodecs.found
    ? Math.round(
        details.audioCodecs.specificity *
          complexityFactor *
          Math.min(details.audioCodecs.count / 2 + 0.5, 1)
      )
    : 0;

  const sourceConf = details.source.found
    ? Math.round(details.source.specificity * complexityFactor)
    : 0;

  const languageConf = details.languages.found
    ? Math.round(details.languages.specificity * complexityFactor * 0.8)
    : 0;

  const foundComponents = [
    details.tvData.found,
    details.year.found,
    details.quality.found,
    details.videoCodec.found,
    details.audioCodecs.found,
    details.source.found,
    details.languages.found,
  ].filter(Boolean).length;

  const componentDiversity = foundComponents / 7;
  const averageSpecificity =
    [
      details.tvData.found ? details.tvData.specificity : 0,
      details.year.found ? details.year.specificity : 0,
      details.quality.found ? details.quality.specificity : 0,
      details.videoCodec.found ? details.videoCodec.specificity : 0,
      details.audioCodecs.found ? details.audioCodecs.specificity : 0,
      details.source.found ? details.source.specificity : 0,
      details.languages.found ? details.languages.specificity : 0,
    ].reduce((sum, val) => sum + val, 0) / 7;

  const overallConf = Math.round(
    averageSpecificity * complexityFactor * componentDiversity * titleLengthFactor
  );

  return {
    overall: Math.min(overallConf, 100),
    quality: qualityConf,
    videoCodec: videoCodecConf,
    audioCodec: audioCodecConf,
    source: sourceConf,
    language: languageConf,
    tvData: tvDataConf,
    year: yearConf,
  };
}

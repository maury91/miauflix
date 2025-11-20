import { findMatches, removeMatches } from './pattern-matcher';
import { MatchResult } from './segment-manager';
import { WorkingText } from './title-extractor';

import {
  PatternConfig,
  TV_EPISODE_ONLY_PATTERN,
  TV_SEASON_EPISODE_PATTERN,
  TV_X_FORMAT_PATTERN,
} from '@/patterns';
import { combineVideoCodecs, isVideoCodecExtraction } from '@/utils/video-codec';

export interface SingleValueExtractionDetails {
  found: boolean;
  specificity: number;
}

export interface MultipleValueExtractionDetails extends SingleValueExtractionDetails {
  count: number;
}

export interface ExtractionDetails {
  tvData: SingleValueExtractionDetails;
  year: SingleValueExtractionDetails;
  quality: SingleValueExtractionDetails;
  videoCodec: MultipleValueExtractionDetails;
  audioCodecs: MultipleValueExtractionDetails;
  source: SingleValueExtractionDetails;
  languages: MultipleValueExtractionDetails;
  titleLength: number;
  originalComplexity: number;
}

/**
 * Extract values with proper type handling for single vs multiple results
 */
export function extractValue<T>(
  workingText: WorkingText,
  patterns: PatternConfig<T>[],
  details: { found: boolean; specificity: number },
  multiple: false
): T | null;
export function extractValue<T>(
  workingText: WorkingText,
  patterns: PatternConfig<T>[],
  details: { found: boolean; specificity: number; count: number },
  multiple: true
): T[];
export function extractValue<T>(
  workingText: WorkingText,
  patterns: PatternConfig<T>[],
  details: typeof multiple extends true
    ? { found: boolean; specificity: number; count: number }
    : { found: boolean; specificity: number },
  multiple: boolean
): T | T[] | null {
  const titleMatches: MatchResult[] = [];
  const descriptionMatches: MatchResult[] = [];

  for (const pattern of patterns) {
    const foundTitleMatches = findMatches(workingText.title, pattern);
    const foundDescriptionMatches = findMatches(workingText.description, pattern);

    titleMatches.push(...foundTitleMatches);
    descriptionMatches.push(...foundDescriptionMatches);
  }

  const allMatches = [...titleMatches, ...descriptionMatches];
  const allValidMatches = allMatches.filter(m => m.value !== null);
  details.found = allValidMatches.length > 0;

  if (allValidMatches.length > 0) {
    details.specificity = Math.max(...allValidMatches.map(m => m.specificity), 0);
  }

  if (multiple) {
    let values = new Set<T>([...allValidMatches.filter(m => m.value).map(m => m.value as T)]);

    // Special handling for video codec combination
    if (isVideoCodecExtraction(values)) {
      // Check if any of the original matches (including nulls) indicate 10bit
      const has10bit = allMatches.some(m => /10.*bit/i.test(m.match));
      values = combineVideoCodecs(values, has10bit) as Set<T>;
    }

    if ('count' in details) {
      details.count = values.size;
    }

    // Remove matches from working text and update segments
    removeMatches(workingText, titleMatches, descriptionMatches);

    return Array.from(values);
  }

  if (allValidMatches.length > 0) {
    const bestMatch = allValidMatches.reduce((best, current) => {
      return current.specificity > best.specificity ? current : best;
    }, allValidMatches[0]);

    // Remove matches from working text and update segments
    removeMatches(
      workingText,
      titleMatches.filter(m => m.value === bestMatch.value),
      descriptionMatches.filter(m => m.value === bestMatch.value)
    );

    return bestMatch.value as T;
  }

  return null;
}

/**
 * Extract TV data and remove matches from working text
 */
export function extractTvData(
  workingText: WorkingText,
  details: ExtractionDetails
): { season?: number; episode?: number } {
  const matches: MatchResult[] = [];

  // S01E01 format (higher specificity) - reset regex state
  TV_SEASON_EPISODE_PATTERN.lastIndex = 0;
  let match;
  while ((match = TV_SEASON_EPISODE_PATTERN.exec(workingText.title)) !== null) {
    matches.push({
      value: { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) },
      match: match[0],
      index: match.index,
      specificity: 95,
    });
  }

  // If no S/E format found, try 1x01 format
  if (matches.length === 0) {
    TV_X_FORMAT_PATTERN.lastIndex = 0;
    while ((match = TV_X_FORMAT_PATTERN.exec(workingText.title)) !== null) {
      matches.push({
        value: { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) },
        match: match[0],
        index: match.index,
        specificity: 80,
      });
    }
  }

  // Finally try episode-only format (E001)
  if (matches.length === 0) {
    TV_EPISODE_ONLY_PATTERN.lastIndex = 0;
    while ((match = TV_EPISODE_ONLY_PATTERN.exec(workingText.title)) !== null) {
      matches.push({
        value: { season: undefined, episode: parseInt(match[1], 10) },
        match: match[0],
        index: match.index,
        specificity: 70,
      });
    }
  }

  if (matches.length > 0) {
    details.tvData.found = true;
    details.tvData.specificity = Math.max(...matches.map(m => m.specificity));

    // Remove matches from working text and update segments
    removeMatches(workingText, matches, []);

    return matches[0].value;
  }

  return {};
}

import { Segment } from './segment-manager';

import { cleanupString } from '@/utils/helpers';

export interface WorkingText {
  title: string;
  description: string;
  titleSegments: Segment[];
  descriptionSegments: Segment[];
}

/**
 * Extract clean title by analyzing remaining segments after metadata removal
 */
export function extractCleanTitleFromSegments(
  workingText: WorkingText,
  originalTitle: string
): string {
  // Get text segments that remain after all removals
  const remainingSegments = workingText.titleSegments
    .filter(segment => segment.end > segment.start) // Only valid segments
    .map(segment => ({
      text: workingText.title.substring(segment.start, segment.end),
      start: segment.start,
      end: segment.end,
      length: segment.end - segment.start,
    }))
    .filter(segment => segment.text.trim().length > 0); // Only non-empty segments

  if (remainingSegments.length === 0) {
    const fallback = cleanupString(originalTitle.replace(/\./g, ' '));
    return fallback;
  }

  // If only one segment, that's our title
  if (remainingSegments.length === 1) {
    const rawText = remainingSegments[0].text;
    const result = cleanupString(rawText);
    return result;
  }

  // Separate movie editions from regular segments
  const movieEditions: typeof remainingSegments = [];
  const regularSegments: typeof remainingSegments = [];

  for (const segment of remainingSegments) {
    const text = segment.text.trim();

    // Skip very short or invalid segments
    if (text.length < 2 || /^\d+$/.test(text)) continue;

    // Skip obvious release group patterns
    if (/^[A-Z]{3,10}$/i.test(text) && text.length < 5) {
      continue; // Skip obvious release groups like "BONE", "HEV", etc.
    }

    // Check if it's a movie edition
    if (
      /\b(extended|director|directors|unrated|uncut|theatrical|final|ultimate|special|deluxe|remastered|redux|cut|proper)\b/i.test(
        text
      )
    ) {
      movieEditions.push(segment);
    } else {
      regularSegments.push(segment);
    }
  }

  // Find the best regular segment (main title)
  let bestMainTitle = '';
  if (regularSegments.length > 0) {
    let bestSegment = regularSegments[0];
    let bestScore = scoreSegmentAsTitle(regularSegments[0].text, regularSegments[0].start);

    for (let i = 0; i < regularSegments.length; i++) {
      const score = scoreSegmentAsTitle(regularSegments[i].text, regularSegments[i].start);
      if (score > bestScore) {
        bestSegment = regularSegments[i];
        bestScore = score;
      }
    }
    bestMainTitle = bestSegment.text;
  }

  // Combine main title with movie editions (with space separation)
  const titleParts = [bestMainTitle];
  if (movieEditions.length > 0) {
    // Add all movie edition parts with proper spacing
    titleParts.push(...movieEditions.map(seg => seg.text));
  }

  const combinedTitle = titleParts.join(' ').replace(/\s+/g, ' '); // Join with space and clean up
  const result = cleanupString(combinedTitle);
  return result;
}

/**
 * Score a text segment to determine how likely it is to be the movie title
 */
export function scoreSegmentAsTitle(segment: string, startPos: number = 0): number {
  let score = segment.length; // Longer segments get higher base score

  // Big bonus for segments that start at the beginning (likely main title)
  if (startPos === 0) score += 50;

  // Penalty for release group indicators
  if (/^[A-Z0-9]+$/i.test(segment.trim())) score -= 20; // All caps/numbers
  if (/^[A-Z]{3,10}$/i.test(segment.trim()) && segment.trim().length < 5) score -= 40; // Short release groups
  if (segment.length < 3) score -= 30; // Too short
  if (/^\d+$/.test(segment.trim())) score -= 50; // Just numbers

  // Bonus for title-like characteristics
  if (/^[A-Z][a-z]/.test(segment.trim())) score += 10; // Starts with capital
  if (segment.includes(' ')) score += 15; // Multi-word
  if (/[a-z]/.test(segment)) score += 10; // Contains lowercase

  // Penalty for technical terms that might have been missed
  if (/\b(x264|x265|hevc|h264|avc|dts|ac3|aac|mp3|flac|opus)\b/i.test(segment)) score -= 25;
  if (/\b(1080p?|720p?|480p?|360p?|2160p?|4k|uhd|hd|sd)\b/i.test(segment)) score -= 25;
  if (/\b(bluray|bdrip|webrip|hdtv|dvdrip|cam|ts)\b/i.test(segment)) score -= 25;

  // Penalty for episode/season patterns that should be filtered out
  if (/\b[eE]\d{2,3}\b/.test(segment)) score -= 40; // E001, E01 patterns
  if (/\b[sS]\d{1,2}[eE]\d{1,3}\b/.test(segment)) score -= 40; // S01E01 patterns
  if (/\b\d{1,2}x\d{2,3}\b/.test(segment)) score -= 40; // 1x01 patterns
  if (/\b(episode|chapter|part)\s*\d+\b/i.test(segment)) score -= 30; // Episode 1, Chapter 1

  return score;
}

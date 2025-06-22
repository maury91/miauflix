import { PatternConfig } from '@/patterns';
import { MatchResult, removeMatch, recalculateSegments } from './segment-manager';
import { WorkingText } from './title-extractor';

/**
 * Find all matches for a pattern
 */
export function findMatches<T>(text: string, pattern: PatternConfig<T>): MatchResult[] {
  const matches: MatchResult[] = [];
  let match;

  pattern.regex.lastIndex = 0; // Reset regex state
  while ((match = pattern.regex.exec(text)) !== null) {
    matches.push({
      value: pattern.value === true ? match[0] : pattern.value,
      match: match[0],
      index: match.index,
      specificity: pattern.specificity,
    });

    // Prevent infinite loop on zero-width matches
    if (match[0].length === 0) break;
  }

  return matches;
}

/**
 * Merge overlapping and contiguous matches
 */
function mergeOverlappingMatches(matches: MatchResult[]): MatchResult[] {
  if (matches.length <= 1) return matches;

  const sorted = matches.sort((a, b) => a.index - b.index);
  const merged: MatchResult[] = [];

  let current = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    const currentEnd = current.index + current.match.length;

    if (next.index <= currentEnd + 1) {
      const mergedStart = current.index;
      const mergedEnd = Math.max(currentEnd, next.index + next.match.length);
      const mergedText =
        matches[0].match + next.match.substring(next.match.length - mergedEnd + currentEnd);

      current = {
        ...current,
        index: mergedStart,
        match: mergedText,
        specificity: Math.max(current.specificity, next.specificity),
      };
    } else {
      merged.push(current);
      current = next;
    }
  }

  merged.push(current);

  return merged;
}

export function removeMatches(
  workingText: WorkingText,
  titleMatches: MatchResult[],
  descriptionMatches: MatchResult[]
): void {
  if (titleMatches.length === 0 && descriptionMatches.length === 0) return;

  // Process title matches
  if (titleMatches.length > 0) {
    // Merge overlapping matches first
    const combinedTitleMatches = mergeOverlappingMatches(titleMatches);

    // Sort by index descending to remove from end to start
    combinedTitleMatches.sort((a, b) => b.index - a.index);

    for (const match of combinedTitleMatches) {
      workingText.title = removeMatch(workingText.title, match);
      workingText.titleSegments = recalculateSegments(workingText.titleSegments, match);
    }
  }

  // Process description matches
  if (descriptionMatches.length > 0) {
    // Merge overlapping matches first
    const mergedDescriptionMatches = mergeOverlappingMatches(descriptionMatches);

    // Sort by index descending to remove from end to start
    const sortedDescriptionMatches = mergedDescriptionMatches.sort((a, b) => b.index - a.index);

    for (const match of sortedDescriptionMatches) {
      workingText.description = removeMatch(workingText.description, match);
      workingText.descriptionSegments = recalculateSegments(workingText.descriptionSegments, match);
    }
  }
}

/**
 * Apply cleanup patterns to remove unwanted terms from working text
 */
export function applyCleanupPatterns<T>(
  workingText: WorkingText,
  patterns: PatternConfig<T>[]
): void {
  const titleMatches: MatchResult[] = [];
  const descriptionMatches: MatchResult[] = [];

  for (const pattern of patterns) {
    const foundTitleMatches = findMatches(workingText.title, pattern);
    const foundDescriptionMatches = findMatches(workingText.description, pattern);

    titleMatches.push(...foundTitleMatches);
    descriptionMatches.push(...foundDescriptionMatches);
  }

  // Remove all matches from working text
  removeMatches(workingText, titleMatches, descriptionMatches);
}

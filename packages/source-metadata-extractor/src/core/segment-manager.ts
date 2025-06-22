export interface Segment {
  start: number;
  end: number;
}

export interface MatchResult {
  value: any;
  match: string;
  index: number;
  specificity: number;
}

/**
 * Expand match to include surrounding brackets/parentheses and matching characters
 */
export function expandMatch(text: string, match: MatchResult): void {
  while (
    text.length > match.index + match.match.length &&
    match.index > 0 &&
    ((text[match.index - 1] === '(' && text[match.index + match.match.length] === ')') ||
      (text[match.index - 1] === '[' && text[match.index + match.match.length] === ']'))
  ) {
    match.index -= 1;
    match.match = text[match.index] + match.match + text[match.index + match.match.length + 1];
  }
  // Extend match to one side
  if (text.length > match.index + match.match.length && match.index > 0) {
    if (text[match.index - 1] === text[match.index + match.match.length]) {
      match.index -= 1;
      match.match = text[match.index] + match.match;
    }
  }
}

/**
 * Remove match from text using expandMatch logic
 */
export function removeMatch(text: string, match: MatchResult): string {
  // Expand match to include surrounding characters if they are the same
  expandMatch(text, match);

  // Remove the match from the text
  return text.substring(0, match.index) + text.substring(match.index + match.match.length);
}

/**
 * Recalculate segments when a match is found
 */
export function recalculateSegments(segments: Segment[], match: MatchResult): Segment[] {
  const newSegments: Segment[] = [];
  const matchStart = match.index;
  const matchEnd = match.index + match.match.length;

  for (const segment of segments) {
    // Case 1: Segment is completely before the match - keep as is
    if (segment.end <= matchStart) {
      newSegments.push({ ...segment });
    }
    // Case 2: Segment is completely after the match - shift it back
    else if (segment.start >= matchEnd) {
      newSegments.push({
        start: segment.start - match.match.length,
        end: segment.end - match.match.length,
      });
    }
    // Case 3: Match is completely within the segment - split the segment
    else if (segment.start < matchStart && segment.end > matchEnd) {
      // Add the part before the match
      if (matchStart > segment.start) {
        newSegments.push({
          start: segment.start,
          end: matchStart,
        });
      }
      // Add the part after the match (shifted)
      if (segment.end > matchEnd) {
        newSegments.push({
          start: matchStart, // New start position after removal
          end: segment.end - match.match.length,
        });
      }
    }
    // Case 4: Segment starts before match but ends within match - trim the end
    else if (segment.start < matchStart && segment.end > matchStart && segment.end <= matchEnd) {
      if (matchStart > segment.start) {
        newSegments.push({
          start: segment.start,
          end: matchStart,
        });
      }
    }
    // Case 5: Segment starts within match but ends after - trim the start and shift
    else if (segment.start >= matchStart && segment.start < matchEnd && segment.end > matchEnd) {
      newSegments.push({
        start: matchStart, // New start position after removal
        end: segment.end - match.match.length,
      });
    }
    // Case 6: Segment is completely within the match - remove it (don't add to newSegments)
    // This case is handled by not adding anything
  }

  // Filter out any invalid segments
  return newSegments.filter(segment => segment.end > segment.start);
}

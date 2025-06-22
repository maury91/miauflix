/**
 * Helper functions for metadata extraction
 */

// Helper function to remove a pattern from a string
export const removePattern = (str: string, pattern: RegExp): { result: string; found: boolean } => {
  const match = str.match(pattern);
  if (match && match.index !== undefined) {
    const before = str.substring(0, match.index);
    const after = str.substring(match.index + match[0].length);
    return {
      result: before + after,
      found: true,
    };
  }
  return {
    result: str,
    found: false,
  };
};

// Helper function to clean up strings after pattern removal
export const cleanupString = (str: string): string => {
  if (!str) return str;

  let result = str;

  // Convert dots to spaces (this was missing!)
  result = result.replace(/\./g, ' ');

  // Clean up consecutive spaces
  result = result.replace(/\s+/g, ' ');

  // Clean up consecutive punctuation
  result = result.replace(/([.,;:!?])\1+/g, '$1');

  // Clean up spaces before punctuation
  result = result.replace(/\s+([.,;:!?])/g, '$1');

  // Clean up spaces around brackets
  result = result.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')');
  result = result.replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');

  // Clean up spaces at the beginning and end
  result = result.trim();

  return result;
};

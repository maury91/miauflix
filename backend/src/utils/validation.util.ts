/**
 * Utility functions for HTTP response validation
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validate HTTP response for content file downloads
 */
export const validateContentFileResponse = (response: Response): ValidationResult => {
  if (!response.ok) {
    return {
      isValid: false,
      error: `HTTP ${response.status}: ${response.statusText}`,
    };
  }

  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/')) {
    return {
      isValid: false,
      error: `Invalid content type: ${contentType}`,
    };
  }

  return { isValid: true };
};

/**
 * Check if content type is valid for metadata files
 */
export const isValidContentMetadata = (contentType: string | null): boolean => {
  return contentType?.includes('application/') ?? false;
};

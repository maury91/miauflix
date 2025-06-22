/**
 * Configuration options for metadata extraction
 */

/**
 * Title normalization options
 */
export interface TitleNormalizationOptions {
  /** Remove file extensions from titles (default: true) */
  removeFileExtensions?: boolean;
  /** Convert dots to spaces (default: true) */
  convertDotsToSpaces?: boolean;
  /** Remove extra spaces (default: true) */
  removeExtraSpaces?: boolean;
  /** Capitalize words (default: false) */
  capitalizeWords?: boolean;
}

/**
 * Main extraction configuration options
 */
export interface ExtractionOptions {
  /** Title normalization settings */
  titleNormalization?: TitleNormalizationOptions;
  /** Enable debug mode for detailed extraction info */
  debug?: boolean;
  /** Maximum processing time in milliseconds (default: 5000) */
  timeout?: number;
  /** Prefer tracker metadata over pattern matching (default: true) */
  preferTrackerData?: boolean;
}

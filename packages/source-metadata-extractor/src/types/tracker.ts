/**
 * Tracker-specific interfaces and types
 */

/**
 * Base interface for tracker-specific enhancements
 */
export interface TrackerEnhancer {
  /**
   * Enhance core extracted data with tracker-specific information
   * @param coreData Base extracted data
   * @param metadata Tracker metadata
   * @returns Enhanced data
   */
  enhance(coreData: any, metadata: any): any;

  /**
   * Get confidence boost provided by this enhancer
   * @returns Confidence boost value (0-100)
   */
  getConfidenceBoost(): number;
}

/**
 * Generic extraction result with confidence
 */
export interface ExtractedData<T> {
  /** The extracted data */
  data: T;
  /** Modified title (if changed during extraction) */
  newTitle: string | null;
  /** Modified description (if changed during extraction) */
  newDescription: string | null;
  /** Confidence score for this extraction */
  confidence?: number;
  /** Method used for extraction */
  method?: 'pattern' | 'tracker' | 'inference';
}

/**
 * Legacy SourceMetadataItem interface for backward compatibility
 */
export interface SourceMetadataItem {
  /** Torrent name */
  name: string;
  /** Description text */
  descr: string | null;
  /** Short name (optional) */
  short_name?: string;
  /** File list */
  files: SourceMetadataFile[] | null;
  /** Category */
  category: string | null;
  /** Type */
  type: string | null;
  /** Size in bytes */
  size: number;
}

/**
 * Legacy file metadata interface
 */
export interface SourceMetadataFile {
  /** File name */
  name: string;
  /** File size in bytes */
  size: number;
  /** Full location path */
  full_location: string;
}

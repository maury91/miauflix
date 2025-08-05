/**
 * File information within a source
 */
export interface FileInfo {
  /** File name */
  name: string;
  /** File size in bytes */
  size: number;
}

/**
 * Tracker-specific metadata that can enhance extraction accuracy
 */
export interface TrackerMetadata {
  // Media quality and codec information
  /** Quality string like "720p", "1080p", "2160p" - more reliable than regex */
  quality?: string;
  /** Video codec like "x264", "x265" - exact codec info */
  videoCodec?: string;
  /** Audio channels like "2.0", "5.1" - for accurate audio codec detection */
  audioChannels?: string;
  /** Bit depth like "8", "10" - for codec variants like x265-10bit */
  bitDepth?: string;
  /** Source type like "web", "bluray" - accurate source information */
  sourceType?: string;

  // Content information
  /** Category string like "Movies", "TV Episodes" - content type validation */
  categoryStr?: string;
  /** Direct season info (more reliable than regex) */
  season?: number;
  /** Direct episode info (more reliable than regex) */
  episode?: number;
  /** Direct language info */
  language?: string;

  // Additional metadata
  /** Upload date - can help infer release year for movies */
  uploadDate?: Date;
  /** Release group information */
  releaseGroup?: string;
  /** IMDB identifier for validation */
  imdbId?: string;
  /** Runtime in seconds - for quality estimation based on file size */
  runtime?: number;
}

/**
 * Main input interface for source metadata extraction
 */
export interface SourceMetadataInput {
  // Required core fields
  /** Source name/title */
  name: string;
  /** Total size in bytes */
  size: number;

  // Optional fields from existing SourceMetadataItem
  /** Optional description text */
  description?: string;
  /** List of files in the source */
  files?: FileInfo[];
  /** Content category */
  category?: string;
  /** Content type */
  type?: string;

  // NEW: Optional tracker-specific enhancements for accuracy
  /** Tracker-specific structured metadata */
  trackerMetadata?: TrackerMetadata;
}

export type StorageActivity = 'active' | 'available_offline' | 'inactive' | 'local_only';

/**
 * What a download holds: a movie, a show's episodes, an anime's (a show numbered by AniList), or
 * `unknown` when its source no longer belongs to anything in the catalog.
 */
export type StorageMediaKind = 'anime' | 'episode' | 'movie' | 'unknown';

export interface StorageItemView {
  sourceId: number;
  kind: StorageMediaKind;
  /** The movie's title or the show's name. */
  title: string;
  /** The movie's year, or which episodes: "S01E02 · Pilot", "Season 1 · 8 episodes". */
  subtitle: string | null;
  /** Landscape artwork as the catalog gives it (a path or URL), else a poster; null if none. */
  image: string | null;
  fileName: string | null;
  quality: string | null;
  /** On disk, its TV remuxes included. */
  physicalBytes: number | null;
  /** Of `physicalBytes`, what its TV remuxes hold. */
  remuxBytes: number;
  reservedBytes: number;
  progressPercent: number;
  videoComplete: boolean;
  activity: StorageActivity;
  torrentLoaded: boolean;
  activeStreams: number;
  seedEndsAt: string | null;
}

export interface StorageInventoryResponse {
  summary: {
    physicalBytes: number | null;
    storageBudgetBytes: number;
    reservedBytes: number;
    chargedBytes: number;
    filesystem: { totalBytes: number; freeBytes: number } | null;
  };
  items: StorageItemView[];
}

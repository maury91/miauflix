export type StorageActivity = 'active' | 'available_offline' | 'inactive' | 'local_only';

export interface StorageItemView {
  movieSourceId: number;
  title: string;
  fileName: string | null;
  quality: string | null;
  physicalBytes: number | null;
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

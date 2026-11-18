import type { MediaDto } from './list.types';

export interface BackdropFocusResponse {
  backdropFocus: { x: number; y: number };
}

export interface BackdropFocusBackgroundResponse {
  accepted: number;
}

/** Card data for the titles asked for, in that order; titles the catalog lacks are left out. */
export interface MediaBatchResponse {
  results: MediaDto[];
}

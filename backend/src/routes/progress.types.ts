// Progress tracking request type (shared with backend)
export interface ProgressRequest {
  type: 'episode' | 'movie';
  progress: number;
  status: 'completed' | 'paused' | 'watching';
  movieId?: string;
  showId?: string;
  season?: number;
  episode?: number;
}

export interface ProgressResponse {
  success: boolean;
  message: string;
}

export interface ProgressItemBase {
  id: string;
  progress: number;
  status: 'completed' | 'paused' | 'watching';
  updatedAt: string;
}

export interface ProgressItemMovie extends ProgressItemBase {
  type: 'movie';
  movieId: string;
}

export interface ProgressItemEpisode extends ProgressItemBase {
  type: 'episode';
  showId: string;
  season: number;
  episode: number;
}

// Progress item for the list response
export type ProgressItem = ProgressItemEpisode | ProgressItemMovie;

// List of progress items for a user
export interface ProgressListResponse {
  progress: ProgressItem[];
}

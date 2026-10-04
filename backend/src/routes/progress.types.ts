import type { PlayableRef } from './playable.types';

export interface ProgressUpdateRequest {
  playable: PlayableRef;
  positionSeconds: number;
  durationSeconds: number;
  state: 'completed' | 'paused' | 'playing';
}

export type ProgressRequest = ProgressUpdateRequest;

export interface ProgressResponse {
  success: boolean;
  message: string;
}

export interface ProgressEntry extends ProgressUpdateRequest {
  updatedAt: string;
  nextEpisode?: true;
}

export interface ProgressListResponse {
  progress: ProgressEntry[];
}

import type { Quality, Source } from '@miauflix/source-metadata-extractor';

import type { PlayableRef } from './playable.types';

export type { MediaIntentRef, PreloadIntentRequest, ReachableIntent } from './playable.types';

export type PreloadPreparationState =
  | 'checking'
  | 'error'
  | 'no_source'
  | 'source_found'
  | 'unknown';

export type PreloadWarmupState = 'failed' | 'not_requested' | 'paused' | 'ready' | 'warming';

export interface PreloadPreparationSource {
  id: number;
  quality: Quality | '3D' | null;
  sourceType: Source | null;
}

export interface PreloadWarmupSnapshot {
  state: PreloadWarmupState;
  /** Percentage of the selected initial torrent range that is verified. */
  progress?: number;
  verifiedBytes?: number;
  targetBytes?: number;
}

export interface PreloadPreparationSnapshot {
  playable: PlayableRef;
  state: PreloadPreparationState;
  source: PreloadPreparationSource | null;
  warmup: PreloadWarmupSnapshot;
}

export interface PreloadIntentResponse {
  acceptedSequence: number;
  expiresAt: string;
  preparation: PreloadPreparationSnapshot | null;
}

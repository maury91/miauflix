import { Quality, type VideoCodec } from '@miauflix/source-metadata-extractor';
import { z } from 'zod';

import { type PlayableRef, playableRefSchema } from './playable.types';

const supportedQualities = ['auto', ...Object.values(Quality)] as ['auto', ...Quality[]];

export const playbackPreferencesSchema = z
  .object({
    quality: z.enum(supportedQualities),
    allowHevc: z.boolean(),
  })
  .strict();

export const createPlaybackSessionRequestSchema = z
  .object({
    playable: playableRefSchema,
    preferences: playbackPreferencesSchema,
  })
  .strict();

export interface CreatePlaybackSessionRequest {
  playable: PlayableRef;
  preferences: { quality: Quality | 'auto'; allowHevc: boolean };
}

export interface CreatePlaybackSessionResponse {
  playbackId: string;
  streamingKey: string;
  streamUrl: string;
  source: {
    id: number;
    quality: Quality | '3D' | null;
    size: number;
    videoCodec: VideoCodec | null;
    broadcasters: number | null;
    watchers: number | null;
  };
  preparation: {
    state: 'cold' | 'warm' | 'warming';
    verifiedBytes: number;
    allocatedBytes: number;
  };
  expiresAt: string;
}

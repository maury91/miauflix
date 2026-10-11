import { Quality, type VideoCodec } from '@miauflix/source-metadata-extractor';
import { z } from 'zod';

import type { PlaybackDelivery } from '@services/playback/audio-playback.service';

import { type PlayableRef, playableRefSchema } from './playable.types';

const supportedQualities = ['auto', ...Object.values(Quality)] as ['auto', ...Quality[]];

export const playbackPreferencesSchema = z
  .object({
    quality: z.enum(supportedQualities),
    allowHevc: z.boolean(),
    supportedMseVideoCodecs: z
      .array(z.enum(['h264', 'hevc']))
      .max(2)
      .optional(),
    audioLanguages: z.array(z.string().min(1).max(35)).max(20).optional(),
    supportedAudioCodecs: z
      .array(z.enum(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'ac3', 'eac3', 'dts']))
      .max(8)
      .optional(),
    supportedMseAudioCodecs: z
      .array(z.enum(['aac', 'mp3', 'opus', 'vorbis', 'flac', 'ac3', 'eac3', 'dts']))
      .max(8)
      .optional(),
    nativeAudioTracks: z.boolean().optional(),
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
  preferences: z.infer<typeof playbackPreferencesSchema>;
}

export interface CreatePlaybackSessionResponse {
  playbackId: string;
  streamingKey: string;
  streamUrl: string;
  delivery?: PlaybackDelivery;
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

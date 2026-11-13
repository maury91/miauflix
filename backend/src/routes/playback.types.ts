import { Quality, type VideoCodec } from '@miauflix/source-metadata-extractor';
import { z } from 'zod';

import { type PlayableRef, playableRefSchema } from '@mytypes/playable.types';
import type { PlaybackDelivery } from '@services/playback/audio-playback.service';
import { TIZEN_AUDIO_CODECS, TIZEN_VIDEO_CODECS } from '@services/playback/device-codecs';

const supportedQualities = ['auto', ...Object.values(Quality)] as ['auto', ...Quality[]];

export const playbackPreferencesSchema = z
  .object({
    quality: z.enum(supportedQualities),
    allowHevc: z.boolean(),
    supportedMseVideoCodecs: z
      .array(z.enum(['h264', 'hevc']))
      .max(2)
      .optional(),
    nativeHevcContainers: z
      .array(z.enum(['mp4', 'matroska']))
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
    /** Prefer another source over converting this one's audio (a TV playing files natively). */
    avoidAudioConversion: z.boolean().optional(),
    playsRemux: z.boolean().optional(),
    /** Every codec a Samsung TV reports it decodes, in Samsung's names (Tizen 6.0 and newer). */
    tizenCodecs: z
      .object({
        audio: z.array(z.enum(TIZEN_AUDIO_CODECS)).max(TIZEN_AUDIO_CODECS.length),
        video: z.array(z.enum(TIZEN_VIDEO_CODECS)).max(TIZEN_VIDEO_CODECS.length),
      })
      .strict()
      .optional(),
    /** Highest average bitrate (kbit/s) the client's connection sustains. */
    maxBitrateKbps: z.number().int().min(500).max(1_000_000).optional(),
  })
  .strict();

export const createPlaybackSessionRequestSchema = z
  .object({
    playable: playableRefSchema,
    preferences: playbackPreferencesSchema,
    deferDownload: z.boolean().optional(),
    avoidSourceIds: z.array(z.number().int().positive()).max(50).optional(),
  })
  .strict();

export interface CreatePlaybackSessionRequest {
  playable: PlayableRef;
  preferences: z.infer<typeof playbackPreferencesSchema>;
  deferDownload?: boolean;
  /** Sources this player already failed to play, so selection moves on to another one. */
  avoidSourceIds?: number[];
}

export interface CreatePlaybackSessionResponse {
  playbackId: string;
  streamingKey: string;
  streamUrl: string;
  delivery?: PlaybackDelivery;
  /** The file is probed in the background; its delivery arrives as `playback-delivery`. */
  deliveryPending?: boolean;
  episodeMatchKind?: 'combined' | 'single';
  /** Which of the compatible sources this session plays ("source 2 of 4"). */
  sourceAttempt?: { position: number; total: number };
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

/** 404 from session creation: `exhausted` when every source found proved fake. */
export interface PlaybackUnavailableResponse {
  error: string;
  reason: 'exhausted' | 'not_found';
}

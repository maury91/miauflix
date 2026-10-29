import type {
  RealtimeMediaRef,
  RealtimePlaybackDelivery,
  RealtimeSourceAvailability,
  RealtimeSourceMessage,
  RealtimeStatusMessage,
} from '@features/realtime/realtime.client';
import type {
  PlayableRef,
  PreloadPreparationSnapshot,
  PreloadPreparationSource,
} from '@miauflix/backend';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface RealtimeState {
  ready: boolean;
  preparationByMediaId: Record<number, PreloadPreparationSnapshot>;
  /** Latest background probe result per playback session. */
  playbackDeliveries: Record<string, RealtimePlaybackDelivery['update']>;
  /** Pushed source availability per playable key, newer than any details response. */
  availabilityByPlayable: Record<string, RealtimeSourceAvailability>;
  /** The candidate a starting playback is trying, per playable key. */
  sourceAttempts: Record<string, { position: number; total: number }>;
}

const initialState: RealtimeState = {
  ready: false,
  preparationByMediaId: {},
  playbackDeliveries: {},
  availabilityByPlayable: {},
  sourceAttempts: {},
};

/** Same identity as the backend's playableKey(): `m:<id>` or `e:<show>:<season>:<episode>`. */
export function realtimePlayableKey(playable: RealtimeMediaRef | PlayableRef): string {
  if (playable.kind === 'episode')
    return `e:${playable.showMediaId}:${playable.seasonNumber}:${playable.episodeNumber}`;
  return `${playable.kind === 'movie' ? 'm' : 's'}:${playable.mediaId}`;
}

function getPlayable(message: RealtimeStatusMessage): PlayableRef {
  return (message.type === 'warmup' ? message.playable : message.media) as PlayableRef;
}

export const realtimeSlice = createSlice({
  name: 'realtime',
  initialState,
  reducers: {
    connectionChanged(state, action: PayloadAction<boolean>) {
      state.ready = action.payload;
    },
    statusReceived(state, action: PayloadAction<RealtimeStatusMessage>) {
      const message = action.payload;
      const playable = getPlayable(message);
      const base = state.preparationByMediaId[message.mediaId] ?? {
        playable,
        state: 'checking' as const,
        source: null,
        warmup: { state: 'not_requested' as const },
      };
      if (message.type === 'source-status') {
        state.preparationByMediaId[message.mediaId] = {
          ...base,
          playable,
          state: message.status as PreloadPreparationSnapshot['state'],
          source: message.sourceId
            ? {
                id: message.sourceId,
                quality: message.quality as PreloadPreparationSource['quality'],
                sourceType: message.source as PreloadPreparationSource['sourceType'],
              }
            : null,
        };
      } else {
        state.preparationByMediaId[message.mediaId] = {
          ...base,
          playable,
          warmup: {
            state: message.status as PreloadPreparationSnapshot['warmup']['state'],
            progress: message.loaded ?? undefined,
            verifiedBytes: message.verifiedBytes ?? undefined,
            targetBytes: message.targetBytes ?? undefined,
          },
        };
      }
    },
    sourceReceived(state, action: PayloadAction<RealtimeSourceMessage>) {
      const message = action.payload;
      const key = realtimePlayableKey(message.playable);
      if (message.type === 'source-attempt') {
        state.sourceAttempts[key] = { position: message.position, total: message.total };
      } else {
        state.availabilityByPlayable[key] = message.availability;
      }
    },
    /** Drop pushed availability so fresh details responses decide again. */
    availabilityCleared(state) {
      state.availabilityByPlayable = {};
    },
    sourceAttemptCleared(state, action: PayloadAction<PlayableRef>) {
      delete state.sourceAttempts[realtimePlayableKey(action.payload)];
    },
    playbackDeliveryReceived(state, action: PayloadAction<RealtimePlaybackDelivery>) {
      state.playbackDeliveries[action.payload.playbackId] = action.payload.update;
    },
    resetRealtimeState() {
      return initialState;
    },
  },
});

export const realtimeActions = realtimeSlice.actions;

export const selectRealtimeReady = (state: { realtime: RealtimeState }) => state.realtime.ready;

export const selectPreparationByMediaId =
  (mediaId: number | undefined) => (state: { realtime: RealtimeState }) =>
    mediaId === undefined ? null : (state.realtime.preparationByMediaId[mediaId] ?? null);

export const selectPlaybackDelivery =
  (playbackId: string | undefined) => (state: { realtime: RealtimeState }) =>
    playbackId === undefined ? null : (state.realtime.playbackDeliveries[playbackId] ?? null);

export const selectSourceAvailability =
  (playable: RealtimeMediaRef | PlayableRef | null | undefined) =>
  (state: { realtime: RealtimeState }) =>
    playable
      ? (state.realtime?.availabilityByPlayable?.[realtimePlayableKey(playable)] ?? null)
      : null;

export const selectSourceAttempt =
  (playable: PlayableRef | null | undefined) => (state: { realtime: RealtimeState }) =>
    playable ? (state.realtime?.sourceAttempts?.[realtimePlayableKey(playable)] ?? null) : null;

const NO_AVAILABILITY: Record<string, RealtimeSourceAvailability> = {};

export const selectPushedAvailability = (state: { realtime: RealtimeState }) =>
  state.realtime?.availabilityByPlayable ?? NO_AVAILABILITY;

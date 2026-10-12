import type { RealtimeStatusMessage } from '@features/realtime/realtime.client';
import type {
  PlayableRef,
  PreloadPreparationSnapshot,
  PreloadPreparationSource,
} from '@miauflix/backend';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface RealtimeState {
  ready: boolean;
  preparationByMediaId: Record<number, PreloadPreparationSnapshot>;
}

const initialState: RealtimeState = {
  ready: false,
  preparationByMediaId: {},
};

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

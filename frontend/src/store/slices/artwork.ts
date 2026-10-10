import type { ArtworkUpdate, MediaRef } from '@miauflix/service-contracts/catalog/v1';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const mediaKey = (mediaType: MediaRef['mediaType'], mediaId: number) => `${mediaType}:${mediaId}`;

interface ArtworkState {
  byMedia: Record<string, ArtworkUpdate>;
}

const initialState: ArtworkState = { byMedia: {} };

export const artworkSlice = createSlice({
  name: 'artwork',
  initialState,
  reducers: {
    received(state, action: PayloadAction<ArtworkUpdate>) {
      const update = action.payload;
      const key = mediaKey(update.mediaType, update.mediaId);
      if ((state.byMedia[key]?.artworkRevision ?? -1) <= update.artworkRevision) {
        state.byMedia[key] = update;
      }
    },
    removed(state, action: PayloadAction<MediaRef[]>) {
      for (const ref of action.payload) delete state.byMedia[mediaKey(ref.mediaType, ref.mediaId)];
    },
    cleared(state) {
      state.byMedia = {};
    },
  },
});

export const artworkActions = artworkSlice.actions;

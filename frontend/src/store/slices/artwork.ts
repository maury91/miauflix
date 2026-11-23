import type { ArtworkUpdate, MediaRef } from '@miauwatch/service-contracts/catalog/v1';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

const mediaKey = (mediaType: MediaRef['mediaType'], mediaId: number) => `${mediaType}:${mediaId}`;

interface ArtworkState {
  byMedia: Record<string, ArtworkUpdate>;
}

const initialState: ArtworkState = { byMedia: {} };

const sameArtwork = (current: ArtworkUpdate, update: ArtworkUpdate) =>
  (Object.keys(update) as (keyof ArtworkUpdate)[]).every(key => current[key] === update[key]);

/**
 * Whether storing `update` changes anything: not when an entry is newer or identical. Home
 * re-reports the artwork of every title it shows; checking first spares every subscriber a
 * notification for an update that changes nothing.
 */
export const artworkChanges = (state: ArtworkState, update: ArtworkUpdate) => {
  const current = state.byMedia[mediaKey(update.mediaType, update.mediaId)];
  if (!current) return true;
  if (current.artworkRevision > update.artworkRevision) return false;
  return current.artworkRevision !== update.artworkRevision || !sameArtwork(current, update);
};

/**
 * Store `update` unless an entry is newer or identical: replacing an equal entry would re-render
 * every card showing it.
 */
const apply = (state: ArtworkState, update: ArtworkUpdate) => {
  if (artworkChanges(state, update))
    state.byMedia[mediaKey(update.mediaType, update.mediaId)] = update;
};

export const artworkSlice = createSlice({
  name: 'artwork',
  initialState,
  reducers: {
    received(state, action: PayloadAction<ArtworkUpdate>) {
      apply(state, action.payload);
    },
    /** Several titles at once: one store update instead of one per title. */
    receivedMany(state, action: PayloadAction<ArtworkUpdate[]>) {
      for (const update of action.payload) apply(state, update);
    },
    removed(state, action: PayloadAction<MediaRef[]>) {
      for (const ref of action.payload) {
        const key = mediaKey(ref.mediaType, ref.mediaId);
        if (key in state.byMedia) delete state.byMedia[key];
      }
    },
    cleared(state) {
      state.byMedia = {};
    },
  },
});

export const artworkActions = artworkSlice.actions;

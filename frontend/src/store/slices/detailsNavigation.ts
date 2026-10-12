import { authApi } from '@features/auth/api/auth.api';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { clearAuth, setSession } from '@store/slices/auth';

export type DetailsMediaType = 'movie' | 'tvshow';
export type DetailsFocusedArea = 'action' | 'season' | 'episodes';

export interface SelectedEpisode {
  seasonNumber: number;
  episodeNumber: number;
}

export interface DetailsNavigationState {
  mediaId: number | null;
  mediaType: DetailsMediaType | null;
  focusedArea: DetailsFocusedArea;
  focusedSeasonIndex: number;
  activeSeasonNumber: number | null;
  selectedEpisode: SelectedEpisode | null;
}

const initialState: DetailsNavigationState = {
  mediaId: null,
  mediaType: null,
  focusedArea: 'action',
  focusedSeasonIndex: 0,
  activeSeasonNumber: null,
  selectedEpisode: null,
};

function initialStateFor(mediaId: number, mediaType: DetailsMediaType): DetailsNavigationState {
  return {
    ...initialState,
    mediaId,
    mediaType,
    focusedArea: mediaType === 'movie' ? 'action' : 'season',
  };
}

export const detailsNavigationSlice = createSlice({
  name: 'detailsNavigation',
  initialState,
  reducers: {
    activateDetails(
      state,
      action: PayloadAction<{ mediaId: number; mediaType: DetailsMediaType }>
    ) {
      if (
        state.mediaId === action.payload.mediaId &&
        state.mediaType === action.payload.mediaType
      ) {
        return;
      }
      return initialStateFor(action.payload.mediaId, action.payload.mediaType);
    },
    setFocusedArea(state, action: PayloadAction<DetailsFocusedArea>) {
      state.focusedArea = action.payload;
    },
    setFocusedSeasonIndex(state, action: PayloadAction<number>) {
      state.focusedSeasonIndex = Math.max(0, action.payload);
    },
    setActiveSeasonNumber(state, action: PayloadAction<number | null>) {
      state.activeSeasonNumber = action.payload;
    },
    selectEpisode(state, action: PayloadAction<SelectedEpisode>) {
      state.focusedArea = 'episodes';
      state.activeSeasonNumber = action.payload.seasonNumber;
      state.selectedEpisode = action.payload;
    },
    resetDetailsNavigation() {
      return initialState;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(clearAuth, () => initialState)
      .addCase(setSession, () => initialState)
      .addMatcher(authApi.endpoints.login.matchFulfilled, () => initialState)
      .addMatcher(authApi.endpoints.claimQrLogin.matchFulfilled, (state, action) =>
        'session' in action.payload ? initialState : state
      )
      .addMatcher(authApi.endpoints.logout.matchFulfilled, () => initialState)
      .addMatcher(authApi.endpoints.logout.matchRejected, () => initialState);
  },
});

export const detailsNavigationActions = detailsNavigationSlice.actions;

export function selectDetailsNavigationForMedia(
  state: { detailsNavigation: DetailsNavigationState },
  mediaId: number,
  mediaType: DetailsMediaType
): DetailsNavigationState {
  const current = state.detailsNavigation;
  return current.mediaId === mediaId && current.mediaType === mediaType
    ? current
    : initialStateFor(mediaId, mediaType);
}

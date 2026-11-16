import { authApi } from '@features/auth/api/auth.api';
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { clearAuth, setSession } from '@store/slices/auth';

export type DetailsMediaType = 'movie' | 'tvshow';

export interface SelectedEpisode {
  seasonNumber: number;
  episodeNumber: number;
}

/**
 * What the details screen remembers across the player: the season shown and the episode last
 * focused, where focus goes back. Transient focus belongs to the navigation layer.
 */
export interface DetailsNavigationState {
  mediaId: number | null;
  mediaType: DetailsMediaType | null;
  activeSeasonNumber: number | null;
  selectedEpisode: SelectedEpisode | null;
}

const initialState: DetailsNavigationState = {
  mediaId: null,
  mediaType: null,
  activeSeasonNumber: null,
  selectedEpisode: null,
};

function initialStateFor(mediaId: number, mediaType: DetailsMediaType): DetailsNavigationState {
  return { ...initialState, mediaId, mediaType };
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
    setActiveSeasonNumber(state, action: PayloadAction<number | null>) {
      state.activeSeasonNumber = action.payload;
    },
    selectEpisode(state, action: PayloadAction<SelectedEpisode>) {
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

import { clearAuth, setSession } from '@store/slices/auth';
import { describe, expect, it } from 'vitest';

import {
  detailsNavigationActions,
  detailsNavigationSlice,
  selectDetailsNavigationForMedia,
} from './detailsNavigation';

describe('details navigation state', () => {
  it('keeps selection keyed to the active media and resets when media changes', () => {
    let state = detailsNavigationSlice.reducer(
      undefined,
      detailsNavigationActions.activateDetails({ mediaId: 41, mediaType: 'tvshow' })
    );
    state = detailsNavigationSlice.reducer(
      state,
      detailsNavigationActions.selectEpisode({ seasonNumber: 2, episodeNumber: 3 })
    );

    expect(
      selectDetailsNavigationForMedia({ detailsNavigation: state }, 41, 'tvshow')
    ).toMatchObject({
      focusedArea: 'episodes',
      activeSeasonNumber: 2,
      selectedEpisode: { seasonNumber: 2, episodeNumber: 3 },
    });
    expect(
      selectDetailsNavigationForMedia({ detailsNavigation: state }, 42, 'movie')
    ).toMatchObject({
      mediaId: 42,
      mediaType: 'movie',
      focusedArea: 'action',
      activeSeasonNumber: null,
      selectedEpisode: null,
    });

    state = detailsNavigationSlice.reducer(
      state,
      detailsNavigationActions.activateDetails({ mediaId: 42, mediaType: 'movie' })
    );
    expect(state.selectedEpisode).toBeNull();
    expect(state.focusedSeasonIndex).toBe(0);
  });

  it('clears media selection on session changes', () => {
    const selected = detailsNavigationSlice.reducer(
      undefined,
      detailsNavigationActions.activateDetails({ mediaId: 41, mediaType: 'tvshow' })
    );

    expect(
      detailsNavigationSlice.reducer(selected, setSession('another-session')).mediaId
    ).toBeNull();
    expect(detailsNavigationSlice.reducer(selected, clearAuth()).selectedEpisode).toBeNull();
  });
});

import { type AppRoute, navigate, navigateBack, useRoute } from '@app/router';
import { getTraktAssociation } from '@features/integrations/api/trakt.api';
import { useGetListsQuery, useGetPopularListsInfiniteQuery } from '@features/media/api/lists.api';
import {
  useGetMovieQuery,
  useGetSeasonQuery,
  useGetShowQuery,
} from '@features/media/api/media.api';
import { mediaApi } from '@features/media/api/media.api';
import {
  useGetNotificationsQuery,
  useMarkNotificationReadMutation,
} from '@features/notifications/api/notifications.api';
import { mediaSubtitleKey, readMediaSubtitles } from '@features/player/lib/media-subtitles';
import {
  useRemoveIntentMutation,
  useUpdateIntentMutation,
} from '@features/preload/api/preload.api';
import { nextPreloadSequence, PRELOAD_CLIENT_ID } from '@features/preload/lib/intent-client';
import { progressApi } from '@features/progress/api/progress.api';
import type { RealtimeMediaRef } from '@features/realtime/realtime.client';
import { realtimeRuntimeActions } from '@features/realtime/realtime.middleware';
import type {
  MediaDto,
  MovieResponse,
  PlayableRef,
  PreloadPreparationSnapshot,
  PreloadPreparationSource,
  ProgressEntry,
  ShowResponse,
} from '@miauflix/backend';
import type { ArtworkUpdate, MediaRef } from '@miauflix/service-contracts/catalog/v1';
import { skipToken } from '@reduxjs/toolkit/query';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { artworkActions } from '@store/slices/artwork';
import { selectCurrentSessionId, selectCurrentUser } from '@store/slices/auth';
import { homeNavigationActions } from '@store/slices/homeNavigation';
import { selectPreparationByMediaId, selectRealtimeReady } from '@store/slices/realtime';
import type { AppDispatch, RootState } from '@store/store';
import { type FC, type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import styled from 'styled-components';

import { CategoryRow, type CategoryRowHandle } from './components/CategoryRow';
import { HomeSidebar } from './components/HomeSidebar';
import { MediaDetails, type MediaDetailsHandle } from './components/MediaDetails';
import { MediaHero } from './components/MediaHero';
import { NotificationsMenu } from './components/NotificationsMenu';
import { PlayerView } from './components/PlayerView';
import { TraktModal } from './components/TraktModal';
import { useMediaBoxSizes } from './hooks/useMediaBoxSizes';
import { unfinishedProgress } from './continue-watching';
import { firstSeason } from './first-season';
import { buildHomeRealtimeInterest } from './homeInterest';
import { type HomeAction, type NavigationOutcome } from './homeNavigation';
import { getMediaTitle } from './media.utils';

const PageContainer = styled.main`
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: #000;
  color: ${PALETTE.text.primary};
  outline: none;
`;

const Content = styled.div<{ $margin: number }>`
  position: absolute;
  inset: 42vh 0 0;
  z-index: 2;
  overflow: hidden auto;
  padding: 6vh ${({ $margin }) => $margin}px 8vh;
  mask-image: linear-gradient(180deg, transparent 5vh, #000 8vh);
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const FullPageState = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${PALETTE.text.muted};
`;

const CONTINUE_CATEGORY = {
  name: 'Continue watching',
  slug: 'continue-watching',
  description: 'Pick up where you left off',
  url: '/continue-watching',
};

/** Build a movie or show card from cached catalog data, returning null when that data is absent. */
function mediaFromProgress(
  state: Pick<RootState, 'mediaApi'>,
  entry: ProgressEntry
): MediaDto | null {
  if (entry.playable.kind === 'movie') {
    const response = mediaApi.endpoints.getMovie.select(entry.playable.mediaId)(state).data;
    if (!response) return null;
    return {
      _type: 'movie',
      id: response.id,
      mediaId: response.mediaId,
      imdbId: response.imdbId,
      title: response.title,
      overview: response.overview,
      poster: response.poster,
      backdrop: response.backdrop,
      backdropFocus: response.backdropFocus,
      logo: response.logo,
      heroLogo: response.heroLogo,
      artworkRevision: response.artworkRevision,
      cardLogoStatus: response.cardLogoStatus,
      heroLogoStatus: response.heroLogoStatus,
      genres: response.genres,
      popularity: response.popularity,
      rating: response.rating,
      releaseDate: response.releaseDate,
      runtime: response.runtime,
    };
  }
  const response = mediaApi.endpoints.getShow.select(entry.playable.showMediaId)(state).data;
  if (!response) return null;
  return {
    _type: 'tvshow',
    id: response.id,
    mediaId: response.mediaId,
    imdbId: response.imdbId,
    name: response.title,
    overview: response.overview ?? '',
    poster: response.poster ?? '',
    backdrop: response.backdrop ?? '',
    backdropFocus: response.backdropFocus,
    logo: response.logo ?? undefined,
    heroLogo: response.heroLogo ?? undefined,
    artworkRevision: response.artworkRevision,
    cardLogoStatus: response.cardLogoStatus,
    heroLogoStatus: response.heroLogoStatus,
    genres: response.genres,
    popularity: response.popularity ?? 0,
    rating: response.rating ?? 0,
    firstAirDate: response.firstAirDate ?? '',
  };
}

function mediaFromMovie(response: MovieResponse): MediaDto {
  return {
    _type: 'movie',
    id: response.id,
    mediaId: response.mediaId,
    imdbId: response.imdbId,
    title: response.title,
    overview: response.overview,
    poster: response.poster,
    backdrop: response.backdrop,
    backdropFocus: response.backdropFocus,
    logo: response.logo,
    heroLogo: response.heroLogo,
    artworkRevision: response.artworkRevision,
    cardLogoStatus: response.cardLogoStatus,
    heroLogoStatus: response.heroLogoStatus,
    genres: response.genres,
    popularity: response.popularity,
    rating: response.rating,
    releaseDate: response.releaseDate,
    runtime: response.runtime,
  };
}

function mediaFromShow(response: ShowResponse): MediaDto {
  return {
    _type: 'tvshow',
    id: response.id,
    mediaId: response.mediaId,
    imdbId: response.imdbId,
    name: response.title,
    overview: response.overview ?? '',
    poster: response.poster ?? '',
    backdrop: response.backdrop ?? '',
    backdropFocus: response.backdropFocus,
    logo: response.logo ?? undefined,
    heroLogo: response.heroLogo ?? undefined,
    artworkRevision: response.artworkRevision,
    cardLogoStatus: response.cardLogoStatus,
    heroLogoStatus: response.heroLogoStatus,
    genres: response.genres,
    popularity: response.popularity ?? 0,
    rating: response.rating ?? 0,
    firstAirDate: response.firstAirDate ?? '',
  };
}

function subtitleLanguageForMedia(
  media: MediaDto | null,
  entries: ProgressEntry[],
  userId?: string
): string {
  const playable =
    media?._type === 'movie'
      ? { kind: 'movie' as const, mediaId: media.mediaId }
      : entries
          .filter(
            entry =>
              entry.playable.kind === 'episode' && entry.playable.showMediaId === media?.mediaId
          )
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]?.playable;
  const saved = playable ? readMediaSubtitles(mediaSubtitleKey(userId, playable)) : null;
  const browser =
    typeof navigator === 'undefined' ? 'en' : (navigator.language.split('-')[0] ?? 'en');
  return saved?.language ?? (/^[a-z]{2,3}$/i.test(browser) ? browser : 'en');
}

interface HomePageProps {
  route?: AppRoute;
  /** Keep browser interaction and focus disabled while Home is preloading behind the intro. */
  interactive?: boolean;
  /** Signal that the initial row, selected hero, and artwork are ready for the intro. */
  onHydrated?: () => void;
}

const FALLBACK_HOME_ROUTE: AppRoute = { type: 'home' };

/** Coordinate browsing, details, and playback with progress refresh, preload interest, and Trakt prompts. */
const HomePage: FC<HomePageProps> = ({ route, interactive = true, onHydrated }) => {
  const dispatch = useDispatch<AppDispatch>();
  const currentRoute = useRoute();
  const activeRoute = route ?? currentRoute ?? FALLBACK_HOME_ROUTE;
  const view =
    activeRoute.type === 'movieDetails' || activeRoute.type === 'showDetails'
      ? 'details'
      : activeRoute.type === 'moviePlayer' || activeRoute.type === 'episodePlayer'
        ? 'player'
        : 'browse';
  const activeRegion = useSelector((state: RootState) => state.homeNavigation.activeRegion);
  const activeCategory = useSelector((state: RootState) => state.homeNavigation.activeCategory);
  const selectedByCategory = useSelector(
    (state: RootState) => state.homeNavigation.selectedByCategory
  );
  const pendingCategoryAdvance = useSelector(
    (state: RootState) => state.homeNavigation.pendingCategoryAdvance
  );
  const playable = useMemo<PlayableRef | null>(
    () =>
      activeRoute.type === 'moviePlayer'
        ? { kind: 'movie', mediaId: activeRoute.mediaId }
        : activeRoute.type === 'episodePlayer'
          ? {
              kind: 'episode',
              showMediaId: activeRoute.showMediaId,
              seasonNumber: activeRoute.seasonNumber,
              episodeNumber: activeRoute.episodeNumber,
            }
          : null,
    [activeRoute]
  );
  const detailMediaId =
    activeRoute.type === 'movieDetails' || activeRoute.type === 'moviePlayer'
      ? activeRoute.mediaId
      : activeRoute.type === 'showDetails' || activeRoute.type === 'episodePlayer'
        ? activeRoute.type === 'showDetails'
          ? activeRoute.mediaId
          : activeRoute.showMediaId
        : null;
  const routedMovie = useGetMovieQuery(
    detailMediaId !== null &&
      (activeRoute.type === 'movieDetails' || activeRoute.type === 'moviePlayer')
      ? detailMediaId
      : skipToken
  );
  const routedShow = useGetShowQuery(
    detailMediaId !== null &&
      (activeRoute.type === 'showDetails' || activeRoute.type === 'episodePlayer')
      ? detailMediaId
      : skipToken
  );
  const routeQuery =
    activeRoute.type === 'movieDetails' || activeRoute.type === 'moviePlayer'
      ? routedMovie
      : routedShow;
  const episodeRoute = activeRoute.type === 'episodePlayer' ? activeRoute : null;
  const currentSeasonQuery = useGetSeasonQuery(
    episodeRoute
      ? { showId: episodeRoute.showMediaId, season: episodeRoute.seasonNumber }
      : skipToken
  );
  // currentData, not data: while a new route loads, data still holds the previous show/season.
  const nextEpisodeInSeason = currentSeasonQuery.currentData?.episodes
    .filter(episode => episode.episodeNumber > (episodeRoute?.episodeNumber ?? Infinity))
    .sort((left, right) => left.episodeNumber - right.episodeNumber)[0];
  const nextSeasonNumber = (routedShow.currentData?.seasons ?? [])
    .filter(
      season =>
        season.seasonNumber > (episodeRoute?.seasonNumber ?? Infinity) && season.seasonNumber > 0
    )
    .sort((left, right) => left.seasonNumber - right.seasonNumber)[0]?.seasonNumber;
  const nextSeasonQuery = useGetSeasonQuery(
    episodeRoute &&
      currentSeasonQuery.currentData &&
      !nextEpisodeInSeason &&
      nextSeasonNumber !== undefined
      ? { showId: episodeRoute.showMediaId, season: nextSeasonNumber }
      : skipToken
  );
  const nextEpisodeAcrossSeason = nextSeasonQuery.currentData?.episodes
    .filter(episode => episode.episodeNumber > 0)
    .sort((left, right) => left.episodeNumber - right.episodeNumber)[0];
  const nextEpisode = episodeRoute
    ? nextEpisodeInSeason
      ? {
          playable: {
            kind: 'episode' as const,
            showMediaId: episodeRoute.showMediaId,
            seasonNumber: episodeRoute.seasonNumber,
            episodeNumber: nextEpisodeInSeason.episodeNumber,
          },
          title: nextEpisodeInSeason.title,
        }
      : nextEpisodeAcrossSeason && nextSeasonNumber !== undefined
        ? {
            playable: {
              kind: 'episode' as const,
              showMediaId: episodeRoute.showMediaId,
              seasonNumber: nextSeasonNumber,
              episodeNumber: nextEpisodeAcrossSeason.episodeNumber,
            },
            title: nextEpisodeAcrossSeason.title,
          }
        : null
    : null;
  const sessionId = useSelector((state: RootState) => selectCurrentSessionId(state));
  const currentUser = useSelector((state: RootState) => selectCurrentUser(state));
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsQuery = useGetNotificationsQuery(undefined, {
    skip: !sessionId,
    pollingInterval: 60_000,
  });
  const [markNotificationRead] = useMarkNotificationReadMutation();
  const progressFromStore = useSelector(
    (state: RootState) => progressApi.endpoints.getProgress.select(undefined)(state).data?.progress
  );
  const progressQueryStatus = useSelector(
    (state: RootState) => progressApi.endpoints.getProgress.select(undefined)(state).status
  );
  const progressEntries = useMemo(
    () => (Array.isArray(progressFromStore) ? progressFromStore : []),
    [progressFromStore]
  );
  const [updateIntent, intentState] = useUpdateIntentMutation();
  const [removeIntent] = useRemoveIntentMutation();
  const {
    data: fixedCategories,
    isLoading,
    isError,
  } = useGetListsQuery(undefined, { skip: view !== 'browse' });
  const {
    data: popularPages,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading: isPopularListsLoading,
  } = useGetPopularListsInfiniteQuery({ limit: 20 }, { skip: view !== 'browse' });
  const categories = useMemo(
    () => [
      ...(fixedCategories ?? []),
      ...(popularPages?.pages.flatMap(page => page.results) ?? []),
    ],
    [fixedCategories, popularPages]
  );
  const continueRefs = useMemo(() => unfinishedProgress(progressEntries), [progressEntries]);
  // Progress polling recreates entry objects even when the watched titles are unchanged. Keep
  // the metadata subscriptions keyed by media identity so polling cannot refetch every title.
  const continueHydrationSignature = continueRefs
    .map(entry =>
      entry.playable.kind === 'movie'
        ? `movie:${entry.playable.mediaId}`
        : `show:${entry.playable.showMediaId}`
    )
    .sort()
    .join('|');
  const continueHydrationKeys = useMemo(
    () => (continueHydrationSignature ? continueHydrationSignature.split('|') : []),
    [continueHydrationSignature]
  );
  const mediaCache = useSelector((state: RootState) => state.mediaApi);
  const continueMedia = useMemo(
    () =>
      continueRefs
        .map(entry => mediaFromProgress({ mediaApi: mediaCache }, entry))
        .filter((media): media is MediaDto => Boolean(media)),
    [continueRefs, mediaCache]
  );
  const displayCategories = useMemo(
    () => (continueMedia.length ? [CONTINUE_CATEGORY, ...categories] : categories),
    [categories, continueMedia.length]
  );
  const { mediaWidth, mediaPerPage, gap, margin, peekWidth } = useMediaBoxSizes();
  const pageRef = useRef<HTMLElement>(null);
  const [browseSelectedMedia, setBrowseSelectedMedia] = useState<MediaDto | null>(null);
  const routeMedia = useMemo(() => {
    if (activeRoute.type === 'movieDetails' || activeRoute.type === 'moviePlayer') {
      return routedMovie.data?.mediaId === detailMediaId ? mediaFromMovie(routedMovie.data) : null;
    }
    return routedShow.data?.mediaId === detailMediaId ? mediaFromShow(routedShow.data) : null;
  }, [activeRoute.type, detailMediaId, routedMovie.data, routedShow.data]);
  const routeMatchesBrowseSelection =
    browseSelectedMedia &&
    (activeRoute.type === 'movieDetails' || activeRoute.type === 'moviePlayer'
      ? browseSelectedMedia._type === 'movie' && browseSelectedMedia.mediaId === activeRoute.mediaId
      : activeRoute.type === 'showDetails' || activeRoute.type === 'episodePlayer'
        ? browseSelectedMedia._type === 'tvshow' &&
          browseSelectedMedia.mediaId ===
            (activeRoute.type === 'showDetails' ? activeRoute.mediaId : activeRoute.showMediaId)
        : false);
  const selectedMedia =
    view === 'browse'
      ? browseSelectedMedia
      : (routeMedia ?? (routeMatchesBrowseSelection ? browseSelectedMedia : null));
  const [readyRowSlugs, setReadyRowSlugs] = useState<Record<string, true>>({});
  const [heroReadyMediaId, setHeroReadyMediaId] = useState<number | null | undefined>(undefined);
  const hydrationNotified = useRef(false);
  const realtimePreparation = useSelector(selectPreparationByMediaId(selectedMedia?.mediaId));
  const realtimeReady = useSelector(selectRealtimeReady);
  const [loadedMediaRefsByCategory, setLoadedMediaRefsByCategory] = useState<
    Record<string, MediaRef[]>
  >({});
  const [showTraktPrompt, setShowTraktPrompt] = useState(false);
  const traktPromptFocus = useRef<HTMLElement | null>(null);
  const traktDismissedSession = useRef<string | null>(null);
  const lastIntentSequence = useRef(0);
  const sourceCache = useRef(new Map<number, PreloadPreparationSource>());
  const lastPreparation = useRef<PreloadPreparationSnapshot | null>(null);
  const previousSessionId = useRef(sessionId);
  const latestIntentSession = useRef<string | null>(sessionId);
  const lastPreparationSession = useRef(sessionId);
  const rowRefs = useRef(new Map<number, CategoryRowHandle>());
  const detailsRef = useRef<MediaDetailsHandle>(null);
  const pendingBrowseFocus = useRef<{ categoryIndex: number; mediaIndex: number } | null>(null);
  const categoryCount = displayCategories.length;
  const navigationRevision = useRef(0);
  const artworkRefsRef = useRef<MediaRef[]>([]);
  const browseFocusState = useRef({ activeCategory, displayCategories, selectedByCategory });
  browseFocusState.current = { activeCategory, displayCategories, selectedByCategory };

  const publishIntent = useCallback(
    (request: Parameters<typeof updateIntent>[0]) => {
      if (!sessionId) return;
      latestIntentSession.current = sessionId;
      return updateIntent(request);
    },
    [sessionId, updateIntent]
  );
  const resetIntentState = intentState.reset;

  useEffect(() => {
    if (previousSessionId.current === sessionId) return;
    previousSessionId.current = sessionId;
    dispatch(progressApi.util.resetApiState());
    latestIntentSession.current = null;
    lastPreparationSession.current = sessionId;
    lastPreparation.current = null;
    sourceCache.current.clear();
    setBrowseSelectedMedia(null);
    setReadyRowSlugs({});
    setHeroReadyMediaId(undefined);
    setLoadedMediaRefsByCategory({});
    resetIntentState?.();
  }, [dispatch, resetIntentState, sessionId]);

  const toRealtimeMedia = useCallback((media: MediaDto | null): RealtimeMediaRef | null => {
    if (!media) return null;
    return media._type === 'movie'
      ? { kind: 'movie', mediaId: media.mediaId }
      : { kind: 'show', mediaId: media.mediaId };
  }, []);

  const onMediaLoaded = useCallback(
    (slug: string, media: MediaDto[]) => {
      const refs = media.map(item => ({
        mediaType: item._type === 'movie' ? ('movie' as const) : ('tv' as const),
        mediaId: item.mediaId,
      }));
      for (const item of media) {
        dispatch(
          artworkActions.received({
            mediaType: item._type === 'movie' ? 'movie' : 'tv',
            mediaId: item.mediaId,
            backdrop: item.backdrop ?? '',
            logo: item.logo ?? '',
            heroLogo: item.heroLogo ?? item.logo ?? '',
            artworkRevision: item.artworkRevision ?? 0,
            cardLogoStatus: item.cardLogoStatus ?? 'pending',
            heroLogoStatus: item.heroLogoStatus ?? 'pending',
          })
        );
      }
      setLoadedMediaRefsByCategory(previous => {
        const current = previous[slug];
        if (
          current?.length === refs.length &&
          current.every(
            (ref, index) =>
              ref.mediaType === refs[index]?.mediaType && ref.mediaId === refs[index]?.mediaId
          )
        )
          return previous;
        return { ...previous, [slug]: refs };
      });
    },
    [dispatch]
  );

  useEffect(() => {
    const activeSlugs = new Set(displayCategories.map(category => category.slug));
    setLoadedMediaRefsByCategory(previous => {
      const next = Object.fromEntries(
        Object.entries(previous).filter(([slug]) => activeSlugs.has(slug))
      );
      return Object.keys(next).length === Object.keys(previous).length ? previous : next;
    });
  }, [displayCategories]);

  const selectedSubtitleLanguage = subtitleLanguageForMedia(
    selectedMedia,
    progressEntries,
    currentUser?.id
  );

  /** Publish the bounded navigation window owned by the visible rows. */
  const publishRealtimeInterest = useCallback(() => {
    const rowCount = displayCategories.length;
    const rowWindows = Array.from({ length: rowCount }, (_, rowIndex) => {
      const window = rowRefs.current.get(rowIndex)?.getInterestWindow?.();
      return window
        ? {
            media: window.media.map(toRealtimeMedia),
            center: window.center,
            visible: window.visible,
          }
        : undefined;
    });
    const interest = buildHomeRealtimeInterest({
      activeCategory,
      rowCount,
      rowWindows,
      selectedMedia: toRealtimeMedia(selectedMedia),
      view,
    });
    const navigation = navigationRevision.current + 1;
    navigationRevision.current = navigation;
    dispatch(
      realtimeRuntimeActions.publishFocusRequested({
        navigationRevision: navigation,
        ...interest.focus,
        subtitleLanguage: selectedSubtitleLanguage,
      })
    );
    dispatch(
      realtimeRuntimeActions.publishMapRequested({
        navigationRevision: navigation,
        ...interest.map,
      })
    );
  }, [
    activeCategory,
    dispatch,
    displayCategories.length,
    selectedMedia,
    selectedSubtitleLanguage,
    toRealtimeMedia,
    view,
  ]);

  useEffect(() => {
    if (!interactive || view !== 'browse') {
      setShowTraktPrompt(false);
      return;
    }
    if (!sessionId || !currentUser) {
      setShowTraktPrompt(false);
      return;
    }
    let cancelled = false;
    let eligible = false;
    let idleTimer: ReturnType<typeof setTimeout>;
    const schedulePrompt = () => {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        if (cancelled || !eligible) return;
        // Show once per effect run; modal input must not restart the timer or overwrite focus.
        eligible = false;
        traktPromptFocus.current = document.activeElement as HTMLElement | null;
        setShowTraktPrompt(true);
      }, 5000);
    };
    // Capture on window: keyboard navigation stops handled keys at the document capture phase.
    window.addEventListener('keydown', schedulePrompt, true);
    window.addEventListener('pointermove', schedulePrompt, true);
    void getTraktAssociation(sessionId).then(result => {
      if (cancelled || !('data' in result) || result.data.connected) return;
      const permanentKey = `miauflix:trakt:dont-ask:${currentUser.id}`;
      const permanentlyDismissed = window.localStorage.getItem(permanentKey) === '1';
      const dismissedForSession = traktDismissedSession.current === sessionId;
      if (!permanentlyDismissed && !dismissedForSession) {
        eligible = true;
        schedulePrompt();
      }
    });
    return () => {
      cancelled = true;
      clearTimeout(idleTimer);
      window.removeEventListener('keydown', schedulePrompt, true);
      window.removeEventListener('pointermove', schedulePrompt, true);
    };
  }, [currentUser, interactive, sessionId, view]);

  useEffect(() => {
    if (!sessionId || view !== 'browse') return;
    const subscription = dispatch(
      progressApi.endpoints.getProgress.initiate(undefined, {
        subscriptionOptions: { pollingInterval: 60_000, skipPollingIfUnfocused: true },
      })
    );
    return () => subscription?.unsubscribe?.();
  }, [dispatch, sessionId, view]);

  const artworkRefs = useMemo(() => {
    const byKey = new Map<string, MediaRef>();
    const add = (media: MediaDto | null | undefined) => {
      if (!media) return;
      const mediaType = media._type === 'movie' ? 'movie' : 'tv';
      byKey.set(`${mediaType}:${media.mediaId}`, { mediaType, mediaId: media.mediaId });
    };
    add(selectedMedia);
    for (const media of continueMedia) add(media);
    for (const ref of Object.values(loadedMediaRefsByCategory).flat()) {
      byKey.set(`${ref.mediaType}:${ref.mediaId}`, ref);
    }
    return [...byKey.values()].slice(0, 5_000);
  }, [continueMedia, loadedMediaRefsByCategory, selectedMedia]);

  useEffect(() => {
    const previous = new Map(
      artworkRefsRef.current.map(ref => [`${ref.mediaType}:${ref.mediaId}`, ref])
    );
    const next = new Map(artworkRefs.map(ref => [`${ref.mediaType}:${ref.mediaId}`, ref]));
    const removed = [...previous].filter(([key]) => !next.has(key)).map(([, ref]) => ref);
    dispatch(realtimeRuntimeActions.artworkSubscriptionsChanged(artworkRefs));
    if (removed.length) dispatch(artworkActions.removed(removed));
    artworkRefsRef.current = artworkRefs;
  }, [artworkRefs, dispatch]);

  useEffect(
    () => () => {
      dispatch(realtimeRuntimeActions.artworkSubscriptionsChanged([]));
      if (artworkRefsRef.current.length) {
        dispatch(artworkActions.removed(artworkRefsRef.current));
      }
    },
    [dispatch]
  );

  useEffect(() => {
    const retained = [...continueMedia, ...(selectedMedia ? [selectedMedia] : [])];
    for (const media of retained) {
      const update: ArtworkUpdate = {
        mediaType: media._type === 'movie' ? 'movie' : 'tv',
        mediaId: media.mediaId,
        backdrop: media.backdrop ?? '',
        logo: media.logo ?? '',
        heroLogo: media.heroLogo ?? media.logo ?? '',
        artworkRevision: media.artworkRevision ?? 0,
        cardLogoStatus: media.cardLogoStatus ?? 'pending',
        heroLogoStatus: media.heroLogoStatus ?? 'pending',
      };
      dispatch(artworkActions.received(update));
    }
  }, [continueMedia, dispatch, selectedMedia]);

  useEffect(() => {
    // These queries supply rendered cards, so retain their data while the row needs it.
    const subscriptions = continueHydrationKeys.map(key => {
      const [kind, mediaId] = key.split(':');
      return kind === 'movie'
        ? dispatch(mediaApi.endpoints.getMovie.initiate(Number(mediaId)))
        : dispatch(mediaApi.endpoints.getShow.initiate(Number(mediaId)));
    });
    return () => subscriptions.forEach(subscription => subscription?.unsubscribe?.());
  }, [continueHydrationKeys, dispatch]);

  const rowLoadState = useMemo(() => {
    const visible = new Set(
      [activeCategory, activeCategory + 1].filter(index => index >= 0 && index < categoryCount)
    );
    const prefetch = Array.from({ length: categoryCount }, (_, index) => index)
      .filter(index => !visible.has(index))
      .sort((left, right) => {
        const distance = (index: number) =>
          index < activeCategory ? activeCategory - index : index - (activeCategory + 1);
        return distance(left) - distance(right) || right - left;
      })
      .slice(0, 4);
    return { visible, prefetch: new Set(prefetch) };
  }, [activeCategory, categoryCount]);

  const hydrationRows = [...rowLoadState.visible, ...rowLoadState.prefetch];
  const rowDataReady =
    isError ||
    hydrationRows.every(index => {
      const category = displayCategories[index];
      return !category || readyRowSlugs[category.slug];
    });
  const heroReady = isError || heroReadyMediaId === (selectedMedia?.mediaId ?? null);
  const listsReady =
    isError ||
    (!isLoading && fixedCategories !== undefined && !isPopularListsLoading && !isFetchingNextPage);
  const progressReady = isError || !sessionId || progressQueryStatus !== 'pending';
  const homeHydrated = listsReady && progressReady && rowDataReady && heroReady;

  useEffect(() => {
    if (!homeHydrated || !onHydrated || hydrationNotified.current) return undefined;
    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        hydrationNotified.current = true;
        onHydrated();
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [homeHydrated, onHydrated]);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage || categories.length === 0) return;
    if (activeCategory >= categories.length - 3) void fetchNextPage();
  }, [activeCategory, categories.length, fetchNextPage, hasNextPage, isFetchingNextPage]);

  useEffect(() => {
    if (!pendingCategoryAdvance || activeCategory + 1 >= displayCategories.length) return;
    dispatch(homeNavigationActions.setPendingCategoryAdvance(false));
    dispatch(homeNavigationActions.setActiveCategory(activeCategory + 1));
  }, [activeCategory, dispatch, displayCategories.length, pendingCategoryAdvance]);

  const handleContentScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      publishRealtimeInterest();
      if (!hasNextPage || isFetchingNextPage) return;
      const element = event.currentTarget;
      if (
        element.scrollTop + element.clientHeight >=
        element.scrollHeight - element.clientHeight * 2
      )
        void fetchNextPage();
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage, publishRealtimeInterest]
  );

  useEffect(() => {
    publishRealtimeInterest();
  }, [publishRealtimeInterest]);

  const focusedMediaId = selectedMedia?.mediaId;
  const focusedMediaKind = selectedMedia
    ? selectedMedia._type === 'movie'
      ? 'movie'
      : 'show'
    : null;

  useEffect(() => {
    if (!sessionId || focusedMediaId === undefined || !focusedMediaKind) return;
    dispatch(
      mediaApi.util.prefetch(
        focusedMediaKind === 'movie' ? 'getMovie' : 'getShow',
        focusedMediaId,
        {
          ifOlderThan: 30,
        }
      )
    );
  }, [dispatch, focusedMediaId, focusedMediaKind, sessionId]);

  const focusedShow = useSelector((state: RootState) =>
    focusedMediaKind === 'show' && focusedMediaId !== undefined
      ? mediaApi.endpoints.getShow.select(focusedMediaId)(state).data
      : undefined
  );
  const focusedSeason = focusedShow ? firstSeason(focusedShow, progressEntries) : undefined;
  const focusedShowId = focusedShow?.mediaId;
  useEffect(() => {
    if (!sessionId || focusedShowId === undefined || focusedSeason === undefined) return;
    dispatch(
      mediaApi.util.prefetch(
        'getSeason',
        { showId: focusedShowId, season: focusedSeason },
        { ifOlderThan: 30 }
      )
    );
  }, [dispatch, focusedShowId, focusedSeason, sessionId]);

  useEffect(() => {
    if (!sessionId || realtimeReady || focusedMediaId === undefined || !focusedMediaKind) return;
    // Catalog updates can recreate card DTOs; only a focus change renews the lease early.
    const focused = { kind: focusedMediaKind, mediaId: focusedMediaId };
    const publish = () => {
      if (document.visibilityState === 'hidden') return;
      const sequence = nextPreloadSequence();
      lastIntentSequence.current = sequence;
      void publishIntent({
        clientId: PRELOAD_CLIENT_ID,
        intent: {
          sequence,
          subtitleLanguage: selectedSubtitleLanguage,
          view: view === 'player' ? 'player' : view === 'details' ? 'details' : 'browse',
          focused: view === 'player' ? null : focused,
          reachable: [],
        },
      });
    };
    publish();
    const heartbeat = window.setInterval(publish, 5_000);
    return () => window.clearInterval(heartbeat);
  }, [
    focusedMediaId,
    focusedMediaKind,
    publishIntent,
    realtimeReady,
    sessionId,
    view,
    selectedSubtitleLanguage,
  ]);

  // Keep the same lease when browsing transitions to details, so discovered
  // source metadata survives the escalation to torrent warmup.
  useEffect(() => {
    if (!sessionId) return;
    return () => {
      if (lastIntentSequence.current === 0) return;
      void removeIntent({
        clientId: PRELOAD_CLIENT_ID,
        sequence: lastIntentSequence.current,
        session: sessionId,
      });
    };
  }, [removeIntent, sessionId]);

  const handleActive = useCallback(
    (categoryIndex: number, _mediaIndex: number, media: MediaDto) => {
      dispatch(homeNavigationActions.setActiveCategory(categoryIndex));
      setBrowseSelectedMedia(media);
    },
    [dispatch]
  );

  const handleRowDataReady = useCallback((slug: string) => {
    setReadyRowSlugs(previous => (previous[slug] ? previous : { ...previous, [slug]: true }));
  }, []);

  const handleHeroReady = useCallback((mediaId: number | null) => {
    setHeroReadyMediaId(mediaId);
  }, []);

  const openDetails = useCallback(
    (media: MediaDto) => {
      setBrowseSelectedMedia(media);
      navigate(
        media._type === 'movie'
          ? { type: 'movieDetails', mediaId: media.mediaId }
          : { type: 'showDetails', mediaId: media.mediaId },
        { parent: { type: 'home' } }
      );
      dispatch(homeNavigationActions.setActiveRegion('details'));
    },
    [dispatch]
  );

  const handleMoveCategory = useCallback(
    (delta: -1 | 1) => {
      if (!displayCategories?.length) return;
      let nextCategory = activeCategory + delta;
      if (nextCategory >= displayCategories.length && delta === 1 && hasNextPage) {
        dispatch(homeNavigationActions.setPendingCategoryAdvance(true));
        if (!isFetchingNextPage) void fetchNextPage();
        return;
      }
      let destinationPending = false;
      while (nextCategory >= 0 && nextCategory < displayCategories.length) {
        const row = rowRefs.current.get(nextCategory);
        const selectedIndex = selectedByCategory[displayCategories[nextCategory].slug] ?? 0;
        if (row?.focusIndex(selectedIndex)) break;
        destinationPending = true;
        if (!row || !row.isEmpty()) break;
        nextCategory += delta;
      }
      if (nextCategory < 0 || nextCategory >= displayCategories.length) return;
      if (nextCategory === activeCategory) return;
      dispatch(homeNavigationActions.setActiveCategory(nextCategory));
      if (destinationPending) {
        pageRef.current?.focus({ preventScroll: true });
      }
    },
    [
      activeCategory,
      dispatch,
      displayCategories,
      fetchNextPage,
      hasNextPage,
      isFetchingNextPage,
      selectedByCategory,
    ]
  );

  const returnToBrowse = useCallback(() => {
    const categoryIndex = activeCategory;
    const category = displayCategories?.[categoryIndex];
    pendingBrowseFocus.current = {
      categoryIndex,
      mediaIndex: category ? (selectedByCategory[category.slug] ?? 0) : 0,
    };
    navigateBack({ type: 'home' });
    dispatch(homeNavigationActions.setActiveRegion('carousel'));
  }, [activeCategory, dispatch, displayCategories, selectedByCategory]);

  const returnToDetails = useCallback(() => {
    const parent =
      playable?.kind === 'movie'
        ? { type: 'movieDetails' as const, mediaId: playable.mediaId }
        : playable?.kind === 'episode'
          ? { type: 'showDetails' as const, mediaId: playable.showMediaId }
          : { type: 'home' as const };
    navigateBack(parent);
    dispatch(homeNavigationActions.setActiveRegion('details'));
  }, [dispatch, playable]);

  const openPlayer = useCallback(
    (nextPlayable: PlayableRef) => {
      navigate(
        nextPlayable.kind === 'movie'
          ? { type: 'moviePlayer', mediaId: nextPlayable.mediaId }
          : { type: 'episodePlayer', ...nextPlayable },
        {
          parent:
            activeRoute.type === 'movieDetails' || activeRoute.type === 'showDetails'
              ? activeRoute
              : undefined,
        }
      );
      dispatch(homeNavigationActions.setActiveRegion('player'));
    },
    [activeRoute, dispatch]
  );

  const openSettings = useCallback(() => {
    if (sessionId) navigate({ type: 'settings' }, { parent: { type: 'home' } });
  }, [sessionId]);

  const dismissTraktPrompt = useCallback(
    (permanent: boolean) => {
      if (currentUser && sessionId) {
        if (permanent) {
          window.localStorage.setItem(`miauflix:trakt:dont-ask:${currentUser.id}`, '1');
        } else {
          traktDismissedSession.current = sessionId;
        }
      }
      setShowTraktPrompt(false);
      requestAnimationFrame(() => traktPromptFocus.current?.focus({ preventScroll: true }));
    },
    [currentUser, sessionId]
  );

  const handleTraktConnected = useCallback(() => {
    dispatch(progressApi.util.invalidateTags(['Progress']));
    setShowTraktPrompt(false);
    requestAnimationFrame(() => traktPromptFocus.current?.focus({ preventScroll: true }));
  }, [dispatch]);

  const isCurrentIntentResult = Boolean(sessionId && latestIntentSession.current === sessionId);
  const intentData = isCurrentIntentResult ? intentState.data : undefined;
  const intentIsLoading = isCurrentIntentResult && intentState.isLoading;
  const intentError = isCurrentIntentResult ? intentState.error : undefined;
  const intentOriginalArgs = isCurrentIntentResult ? intentState.originalArgs : undefined;
  if (intentData) {
    lastPreparation.current = intentData.preparation ?? null;
    lastPreparationSession.current = sessionId;
  }
  const responsePreparation =
    realtimePreparation ??
    (intentData
      ? intentData.preparation
      : intentIsLoading && lastPreparationSession.current === sessionId
        ? lastPreparation.current
        : undefined);
  useEffect(() => {
    if (responsePreparation?.playable.kind !== 'movie') return;
    const mediaId = responsePreparation.playable.mediaId;
    if (responsePreparation.source) {
      sourceCache.current.delete(mediaId);
      sourceCache.current.set(mediaId, responsePreparation.source);
      if (sourceCache.current.size > 256) {
        sourceCache.current.delete(sourceCache.current.keys().next().value!);
      }
    } else if (responsePreparation.state === 'no_source') {
      sourceCache.current.delete(mediaId);
    }
  }, [responsePreparation]);

  const matchedPreparation =
    selectedMedia?._type === 'movie' &&
    responsePreparation?.playable.kind === 'movie' &&
    responsePreparation.playable.mediaId === selectedMedia.mediaId
      ? responsePreparation
      : null;
  const cachedSource =
    selectedMedia?._type === 'movie' ? sourceCache.current.get(selectedMedia.mediaId) : undefined;
  const preparation: PreloadPreparationSnapshot | null =
    cachedSource && (!matchedPreparation || matchedPreparation.state === 'checking')
      ? {
          playable: { kind: 'movie', mediaId: selectedMedia!.mediaId },
          state: 'source_found',
          source: cachedSource,
          // A prior visit's buffer may have been paused or evicted. Only current
          // backend responses can report live warmup progress.
          warmup: matchedPreparation?.warmup ?? { state: 'not_requested' },
        }
      : (matchedPreparation ??
        (selectedMedia?._type === 'movie' &&
        intentOriginalArgs?.intent.focused?.kind === 'movie' &&
        intentOriginalArgs.intent.focused.mediaId === selectedMedia.mediaId &&
        intentError
          ? {
              playable: { kind: 'movie', mediaId: selectedMedia.mediaId },
              state: 'error',
              source: null,
              warmup: { state: 'not_requested' },
            }
          : null));

  useEffect(() => {
    if (view === 'details') {
      dispatch(homeNavigationActions.setActiveRegion('details'));
      return;
    }
    if (view === 'player') {
      dispatch(homeNavigationActions.setActiveRegion('player'));
      return;
    }
    dispatch(homeNavigationActions.setActiveRegion('carousel'));
    const pending = pendingBrowseFocus.current;
    const { activeCategory, displayCategories, selectedByCategory } = browseFocusState.current;
    const categoryIndex = pending?.categoryIndex ?? activeCategory;
    const category = displayCategories[categoryIndex];
    const mediaIndex =
      pending?.mediaIndex ?? (category ? (selectedByCategory[category.slug] ?? 0) : 0);
    const row = rowRefs.current.get(categoryIndex);
    if (!row) return;
    row.focusIndex(mediaIndex);
    pendingBrowseFocus.current = null;
  }, [activeRoute, dispatch, view]);

  const handleSidebarAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      if (action === 'right' || action === 'confirm' || action === 'back') {
        dispatch(homeNavigationActions.setActiveRegion('carousel'));
        const category = displayCategories?.[activeCategory];
        rowRefs.current
          .get(activeCategory)
          ?.focusIndex(category ? (selectedByCategory[category.slug] ?? 0) : 0);
        return { type: 'handled' };
      }
      return { type: 'handled' };
    },
    [activeCategory, dispatch, displayCategories, selectedByCategory]
  );

  const handleHomeAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      if (showTraktPrompt) return { type: 'ignored' };
      if (view === 'player') {
        return action === 'back' ? (returnToDetails(), { type: 'handled' }) : { type: 'ignored' };
      }
      if (view === 'details') {
        const outcome = detailsRef.current?.handleAction(action) ?? { type: 'ignored' as const };
        if (action === 'back' && outcome.type === 'escape') {
          returnToBrowse();
        }
        return outcome;
      }

      if (activeRegion === 'sidebar') return handleSidebarAction(action);

      const row = rowRefs.current.get(activeCategory);
      const outcome = row?.handleAction(action) ?? { type: 'ignored' as const };
      if (outcome.type === 'escape') {
        if (outcome.direction === 'left') {
          dispatch(homeNavigationActions.setActiveRegion('sidebar'));
        } else if (outcome.direction === 'up' || outcome.direction === 'down') {
          handleMoveCategory(outcome.direction === 'up' ? -1 : 1);
        }
      }
      return outcome;
    },
    [
      activeCategory,
      activeRegion,
      dispatch,
      handleMoveCategory,
      handleSidebarAction,
      returnToBrowse,
      returnToDetails,
      showTraktPrompt,
      view,
    ]
  );

  const navigationRef = useKeyboardNavigation({
    enabled: interactive && !showTraktPrompt && !notificationsOpen,
    onLeft: () => handleHomeAction('left').type !== 'ignored',
    onRight: () => handleHomeAction('right').type !== 'ignored',
    onUp: () => handleHomeAction('up').type !== 'ignored',
    onDown: () => handleHomeAction('down').type !== 'ignored',
    onConfirm: () => handleHomeAction('confirm').type !== 'ignored',
    onBack: () => handleHomeAction('back').type !== 'ignored',
  });

  const closeNotifications = useCallback(() => {
    setNotificationsOpen(false);
    requestAnimationFrame(() => notificationsButtonRef.current?.focus({ preventScroll: true }));
  }, []);

  useEffect(() => {
    if (view !== 'browse') setNotificationsOpen(false);
  }, [view]);

  if (view === 'browse' && isLoading) {
    return (
      <PageContainer>
        <FullPageState>
          <Spinner text="Loading categories..." size={32} />
        </FullPageState>
      </PageContainer>
    );
  }
  if (view === 'browse' && (isError || !fixedCategories)) {
    return (
      <PageContainer>
        <FullPageState>Failed to load categories.</FullPageState>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      ref={node => {
        pageRef.current = node;
        navigationRef(node);
      }}
      tabIndex={-1}
    >
      <div inert={showTraktPrompt} style={{ display: 'contents' }}>
        {view === 'browse' ? (
          <>
            <MediaHero media={selectedMedia} preparation={preparation} onReady={handleHeroReady} />
            <Content $margin={margin} onScroll={handleContentScroll}>
              {displayCategories.map((category, index) => (
                <CategoryRow
                  key={category.slug}
                  ref={handle => {
                    if (handle) rowRefs.current.set(index, handle);
                    else rowRefs.current.delete(index);
                  }}
                  category={category}
                  categoryIndex={index}
                  initialIndex={selectedByCategory[category.slug] ?? 0}
                  selectedIndex={selectedByCategory[category.slug] ?? 0}
                  onSelectionChange={mediaIndex =>
                    dispatch(
                      homeNavigationActions.setCategorySelection({
                        slug: category.slug,
                        index: mediaIndex,
                      })
                    )
                  }
                  loadIntent={
                    rowLoadState.visible.has(index)
                      ? 'visible'
                      : rowLoadState.prefetch.has(index)
                        ? 'prefetch'
                        : 'dormant'
                  }
                  visible={rowLoadState.visible.has(index)}
                  mediaWidth={mediaWidth}
                  mediaPerPage={mediaPerPage}
                  gap={gap}
                  peekWidth={peekWidth}
                  isCurrentRow={activeCategory === index}
                  onDataReady={handleRowDataReady}
                  active={
                    interactive &&
                    !showTraktPrompt &&
                    activeRegion === 'carousel' &&
                    activeCategory === index
                  }
                  onActive={handleActive}
                  onInterest={publishRealtimeInterest}
                  onMediaLoaded={onMediaLoaded}
                  progress={progressEntries}
                  mediaOverride={
                    category.slug === CONTINUE_CATEGORY.slug ? continueMedia : undefined
                  }
                  onSelect={openDetails}
                />
              ))}
            </Content>
            <HomeSidebar
              active={
                interactive && !showTraktPrompt && !notificationsOpen && activeRegion === 'sidebar'
              }
              onAction={handleSidebarAction}
              onHover={() => dispatch(homeNavigationActions.setActiveRegion('sidebar'))}
              onSettings={openSettings}
              onNotifications={() => {
                setNotificationsOpen(true);
                if (sessionId) void notificationsQuery.refetch();
              }}
              notificationsRef={notificationsButtonRef}
              unreadCount={notificationsQuery.data?.unreadCount ?? 0}
            />
          </>
        ) : view === 'details' && selectedMedia ? (
          <MediaDetails
            ref={detailsRef}
            media={selectedMedia}
            onBack={returnToBrowse}
            onWatch={openPlayer}
            preparation={preparation}
          />
        ) : view === 'details' ? (
          <FullPageState role="status">
            {routeQuery.isError ? (
              <div>
                <p>Unable to load this title.</p>
                <button type="button" onClick={() => void routeQuery.refetch()}>
                  Retry
                </button>
                <button type="button" onClick={returnToBrowse}>
                  Back to Home
                </button>
              </div>
            ) : (
              <Spinner />
            )}
          </FullPageState>
        ) : view === 'player' && playable ? (
          <PlayerView
            playable={playable}
            title={selectedMedia ? getMediaTitle(selectedMedia) : 'Selected title'}
            onBack={returnToDetails}
            nextEpisode={nextEpisode}
            onPlayNext={() => {
              if (nextEpisode) openPlayer(nextEpisode.playable);
            }}
          />
        ) : null}
      </div>
      {view === 'browse' && notificationsOpen && (
        <NotificationsMenu
          notifications={notificationsQuery.data?.notifications ?? []}
          loading={notificationsQuery.isLoading}
          failed={notificationsQuery.isError}
          sidebarActive={activeRegion === 'sidebar'}
          onClose={closeNotifications}
          onRetry={() => void notificationsQuery.refetch()}
          onMarkRead={id => void markNotificationRead(id)}
        />
      )}
      {interactive && showTraktPrompt && sessionId && (
        <TraktModal
          sessionId={sessionId}
          onConnected={handleTraktConnected}
          onDismiss={dismissTraktPrompt}
        />
      )}
    </PageContainer>
  );
};

export default HomePage;

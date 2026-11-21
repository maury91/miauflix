import {
  useAddToWatchlistMutation,
  useGetWatchlistMembershipQuery,
  useRemoveFromWatchlistMutation,
} from '@features/media/api/lists.api';
import {
  useEnsureBackdropFocusMutation,
  useGetMovieQuery,
  useGetShowQuery,
} from '@features/media/api/media.api';
import { useGetMediaRatingQuery, useSetMediaRatingMutation } from '@features/media/api/ratings.api';
import { useRequestAvailabilityMutation } from '@features/notifications/api/notifications.api';
import { SourcePreparationStatus } from '@features/preload/ui/SourcePreparationStatus';
import { progressForPlayable, useGetProgressQuery } from '@features/progress/api/progress.api';
import { episodeForSeason } from '@features/progress/lib/episode-rules';
import type {
  MediaDto,
  PlayableRef,
  PreloadPreparationSnapshot,
  SeasonResponse,
} from '@miauflix/backend';
import { createSelector } from '@reduxjs/toolkit';
import { skipToken } from '@reduxjs/toolkit/query';
import {
  Button,
  Heading,
  IconButtonGroup,
  type IconButtonGroupItem,
  isSplitStacked,
  Message,
  NavItem,
  NavRail,
  ProgressBar,
  ProgressSpinner,
  ScrollArea,
  SplitLayout,
  SurfaceContextProvider,
  Text,
  useWindowClass,
} from '@shared/design-system';
import { visuallyHidden } from '@shared/design-system/a11y.css';
import { useT } from '@shared/i18n';
import { t as translate } from '@shared/i18n';
import { presentError } from '@shared/lib/api-error';
import type { BackdropPositionContext } from '@shared/lib/backdrop-focus';
import { getBackdropPlacement } from '@shared/lib/backdrop-focus';
import { imagePreloader, URGENT } from '@shared/lib/image-preloader';
import { artworkUrl, formatRuntime, getMediaTitle } from '@shared/lib/media.utils';
import {
  FocusGroup,
  FocusScope,
  NavigationProvider,
  useActiveIdWithin,
  useNavigation,
} from '@shared/navigation';
import {
  detailsNavigationActions,
  selectDetailsNavigationForMedia,
} from '@store/slices/detailsNavigation';
import { selectPushedAvailability, selectSourceAvailability } from '@store/slices/realtime';
import type { RootState } from '@store/store';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { useShowSeasons } from '../hooks/useShowSeasons';
import { firstSeason } from '../lib/first-season';
import { episodeNavId, parseEpisodeNavId, seasonNavId } from './episodes.utils';
import { EPISODES_GROUP, EpisodesSection } from './EpisodesSection';
import * as styles from './mediaDetails.css';

import ArrowLeftIcon from '~icons/mdi/arrow-left';
import BellIcon from '~icons/mdi/bell-ring-outline';
import BookmarkIcon from '~icons/mdi/bookmark';
import BookmarkOutlineIcon from '~icons/mdi/bookmark-outline';
import HeartIcon from '~icons/mdi/cards-heart';
import HeartOutlineIcon from '~icons/mdi/cards-heart-outline';
import CheckIcon from '~icons/mdi/check';
import StarIcon from '~icons/mdi/star';
import ThumbDownIcon from '~icons/mdi/thumb-down';
import ThumbDownOutlineIcon from '~icons/mdi/thumb-down-outline';
import ThumbUpIcon from '~icons/mdi/thumb-up';
import ThumbUpOutlineIcon from '~icons/mdi/thumb-up-outline';

interface MediaDetailsProps {
  media: MediaDto;
  onWatch: (playable: PlayableRef) => void;
  onBack: () => void;
  preparation?: PreloadPreparationSnapshot | null;
}

/** IDs in the navigation layer. */
const NAV = {
  scope: 'details',
  rail: 'details-rail',
  back: 'details-back',
  content: 'details-content',
  info: 'details-info',
  actions: 'details-actions',
  ratingRetry: 'details-rating-retry',
  watch: 'details-watch',
  seasons: 'details-seasons',
} as const;

/** Focusing an episode this close to the end of the loaded ones loads the next season. */
const LOAD_NEXT_WITHIN_EPISODES = 3;

type WarmupState = PreloadPreparationSnapshot['warmup']['state'];
type Rating = 'dislike' | 'like' | 'love';

const formatYear = (value: string | null | undefined) => value?.slice(0, 4) ?? '';

/** Describe torrent warmup for assistive text; progress is an already formatted percentage. */
function warmupDescription(state: WarmupState, progress: number): string {
  switch (state) {
    case 'warming':
      return translate('details.warming', { progress });
    case 'ready':
      return translate('details.warmReady');
    case 'paused':
      return translate('details.warmPaused');
    case 'failed':
      return translate('details.warmFailed');
    case 'not_requested':
    default:
      return translate('details.warmNotRequested');
  }
}

/** The failure in one or two sentences: the server's message and, when there is one, the fix. */
function errorText(error: unknown, fallback: string): string {
  const { message, hint } = presentError(error, fallback);
  return hint ? `${message} ${hint}` : message;
}

/**
 * Focuses a node once it is mounted (a season's episodes arrive after the press that asked for
 * them), unless the user moved on in the meantime: focus must still be where it was when asked.
 */
function useFocusWhenReady() {
  const { focus, getActiveId } = useNavigation();
  const pending = useRef<{ id: string; from: string | null } | null>(null);
  const attempt = useCallback(() => {
    const wanted = pending.current;
    if (!wanted) return;
    if (getActiveId() !== wanted.from) pending.current = null;
    else if (focus(wanted.id)) pending.current = null;
  }, [focus, getActiveId]);
  // Every commit can mount the node
  useEffect(attempt);
  return useCallback(
    /** `from`: where focus was when the user asked, if that was earlier than now. */
    (id: string, from: string | null = getActiveId()) => {
      pending.current = { id, from };
      attempt();
    },
    [attempt, getActiveId]
  );
}

/**
 * A title's details on the design system: the back rail; the logo, facts, overview, the rating
 * actions and the main action over the backdrop; for shows the seasons and, beside them, the
 * episodes. The screen is one navigation scope; Home keeps only Back.
 */
export function MediaDetails(props: MediaDetailsProps) {
  return (
    <NavigationProvider>
      <DetailsScreen {...props} />
    </NavigationProvider>
  );
}

function DetailsScreen({ media, onBack, onWatch, preparation = null }: MediaDetailsProps) {
  const t = useT();
  const dispatch = useDispatch();
  const [ensureBackdropFocus] = useEnsureBackdropFocusMutation();
  const watchlistType: 'movie' | 'tv' = media._type === 'movie' ? 'movie' : 'tv';
  const watchlist = useGetWatchlistMembershipQuery({
    mediaType: watchlistType,
    mediaId: media.mediaId,
  });
  const [addToWatchlist, addState] = useAddToWatchlistMutation();
  const [removeFromWatchlist, removeState] = useRemoveFromWatchlistMutation();
  const watchlistPending = addState.isLoading || removeState.isLoading;
  const inWatchlist = watchlist.data?.inWatchlist ?? false;
  const progress = useGetProgressQuery(undefined);
  const pageRef = useRef<HTMLElement>(null);
  const [resolvedBackdropFocus, setResolvedBackdropFocus] = useState(media.backdropFocus);
  const [backdropContext, setBackdropContext] = useState<BackdropPositionContext>();
  const stacked = isSplitStacked(useWindowClass(), 'expanded');
  const focusWhenReady = useFocusWhenReady();
  const selectCurrentDetailsNavigation = useMemo(
    () =>
      createSelector([(state: RootState) => state.detailsNavigation], detailsNavigation =>
        selectDetailsNavigationForMedia({ detailsNavigation }, media.mediaId, media._type)
      ),
    [media.mediaId, media._type]
  );
  const { activeSeasonNumber, selectedEpisode } = useSelector(selectCurrentDetailsNavigation);
  const userId = useSelector((state: RootState) => state.auth.currentUser?.id);
  const ratingItem = { mediaType: watchlistType, mediaId: media.mediaId, userId: userId ?? '' };
  const savedRating = useGetMediaRatingQuery(userId ? ratingItem : skipToken, {
    refetchOnMountOrArgChange: true,
  });
  const [setMediaRating, ratingUpdate] = useSetMediaRatingMutation();
  const { reset: resetRatingUpdate } = ratingUpdate;
  const selectedRating = savedRating.currentData?.rating ?? null;
  const ratingPending =
    !savedRating.currentData || savedRating.isFetching || ratingUpdate.isLoading;
  const changeRating = (rating: Rating) => {
    if (!userId || ratingPending) return;
    void setMediaRating({ ...ratingItem, rating: selectedRating === rating ? null : rating });
  };

  const movie = useGetMovieQuery(media._type === 'movie' ? media.mediaId : skipToken);
  const pushedAvailability = useSelector(
    selectSourceAvailability(
      media._type === 'movie' ? { kind: 'movie', mediaId: media.mediaId } : null
    )
  );
  const movieAvailability = pushedAvailability ?? movie.data?.sourceAvailability ?? null;
  const [requestAvailability, availabilityRequest] = useRequestAvailabilityMutation();
  const notifyRequestedHere =
    availabilityRequest.originalArgs?.kind === 'movie' &&
    availabilityRequest.originalArgs.mediaId === media.mediaId;
  const notifyRequested = notifyRequestedHere && availabilityRequest.isSuccess;
  const pushedEpisodeAvailability = useSelector(selectPushedAvailability);
  const show = useGetShowQuery(media._type === 'tvshow' ? media.mediaId : skipToken);
  const showDetails = show.data;
  const movieProgress =
    media._type === 'movie'
      ? progressForPlayable(progress.data?.progress ?? [], {
          kind: 'movie',
          mediaId: media.mediaId,
        })
      : undefined;
  const seasons = useMemo(
    () => [...(showDetails?.seasons ?? [])].sort((a, b) => a.seasonNumber - b.seasonNumber),
    [showDetails?.seasons]
  );
  const initialSeason = showDetails
    ? firstSeason(showDetails, progress.data?.progress ?? [])
    : undefined;
  const seasonNumbers = useMemo(() => seasons.map(season => season.seasonNumber), [seasons]);
  const showSeasons = useShowSeasons({
    showId: media._type === 'tvshow' ? media.mediaId : null,
    seasonNumbers,
    openingSeason: initialSeason,
  });
  const {
    loaded: loadedSeasons,
    loadedSections,
    request: requestSeason,
    retry: retrySeasonLoad,
  } = showSeasons;

  useEffect(() => {
    dispatch(
      detailsNavigationActions.activateDetails({ mediaId: media.mediaId, mediaType: media._type })
    );
  }, [dispatch, media.mediaId, media._type]);

  useEffect(() => {
    resetRatingUpdate();
  }, [media._type, media.mediaId, userId, resetRatingUpdate]);

  // The app logo moves aside on this screen
  useEffect(() => {
    document.body.dataset['miauflixDetails'] = 'true';
    return () => {
      delete document.body.dataset['miauflixDetails'];
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setResolvedBackdropFocus(media.backdropFocus);
    if (media.backdropFocus || !media.backdrop) return;
    void ensureBackdropFocus({
      mediaType: media._type === 'movie' ? 'movie' : 'tv',
      mediaId: media.mediaId,
    })
      .unwrap()
      .then(result => {
        if (!cancelled) setResolvedBackdropFocus(result.backdropFocus);
      })
      .catch(() => {
        if (!cancelled) setResolvedBackdropFocus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ensureBackdropFocus, media.backdrop, media.backdropFocus, media.mediaId, media._type]);

  const current = media._type === 'movie' ? movie.data : showDetails;
  const artworkType = media._type === 'movie' ? 'movie' : 'tv';
  const artwork = useSelector(
    (state: RootState) => state.artwork.byMedia[`${artworkType}:${media.mediaId}`]
  );
  const currentRevision = current?.artworkRevision ?? media.artworkRevision ?? 0;
  const detailLogo =
    artwork && artwork.artworkRevision >= currentRevision
      ? artwork.heroLogo
      : (current?.heroLogo ?? current?.logo ?? media.heroLogo ?? media.logo);
  const title = current?.title ?? getMediaTitle(media);
  const selectedBackdrop =
    artwork && artwork.artworkRevision >= currentRevision
      ? artwork.backdrop
      : (current?.backdrop ?? media.backdrop);
  // The hero's resting backdrop when it has loaded; otherwise the one it showed while moving,
  // so opening details never waits for a larger image. Chosen once, so it never swaps while open.
  const backdrop = useMemo(() => {
    const resting = artworkUrl(selectedBackdrop, 'backdrop-resting');
    return imagePreloader.isLoaded(resting) ? resting : artworkUrl(selectedBackdrop, 'backdrop');
  }, [selectedBackdrop]);
  const backdropFocus = current?.backdropFocus ?? media.backdropFocus ?? resolvedBackdropFocus;
  const backdropPlacement = getBackdropPlacement(backdropFocus, backdropContext);
  const warmupState: WarmupState = preparation?.warmup?.state ?? 'not_requested';
  const warmupPercent = Math.min(100, Math.max(0, preparation?.warmup?.progress ?? 0));
  const warmupDisplayPercent = Math.round(warmupPercent);

  useEffect(() => {
    setBackdropContext(undefined);
    const element = pageRef.current;
    if (!element || !backdrop || typeof window === 'undefined') return;
    let cancelled = false;
    let size: { width: number; height: number } | null = null;
    const update = () => {
      if (cancelled || !size || size.width <= 0 || size.height <= 0) return;
      const bounds = element.getBoundingClientRect();
      setBackdropContext({
        imageWidth: size.width,
        imageHeight: size.height,
        containerWidth: bounds.width,
        containerHeight: bounds.height,
        targetX: 0.51,
        targetY: 0.482,
        maxZoom: 1.25,
      });
    };
    // The same queue as the hero, so a backdrop it already loaded is sized at once.
    imagePreloader.load(backdrop, URGENT).then(
      loaded => {
        size = loaded;
        update();
      },
      () => undefined
    );
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener('resize', update);
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [backdrop]);

  const facts = useMemo(() => {
    if (!current) return [];
    if (current.type === 'movie') {
      return [
        current.runtime ? formatRuntime(current.runtime) : '',
        formatYear(current.releaseDate),
      ].filter(Boolean);
    }
    return [
      formatYear(current.firstAirDate),
      current.seasons.length
        ? `${current.seasons.length} season${current.seasons.length === 1 ? '' : 's'}`
        : '',
    ].filter(Boolean);
  }, [current]);
  const rating = current?.rating ? current.rating.toFixed(1) : null;

  const targetEpisodeForSeason = useCallback(
    (season: SeasonResponse) =>
      episodeForSeason(season, media.mediaId, progress.data?.progress ?? []),
    [media.mediaId, progress.data?.progress]
  );

  // Where focus starts: back on the episode left for the player, else the opening season (shows)
  // or the main action (movies). Shows wait for their seasons and episodes to mount.
  // Focus moved by the user while the show loads (to Back, say) is theirs to keep: where focus
  // was on opening is the origin, recorded once the screen's scope has taken it.
  const { getActiveId } = useNavigation();
  const initialFocusFrom = useRef<string | null>(null);
  useEffect(() => {
    initialFocusFrom.current = getActiveId();
    // Once, on opening
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const initialFocusAsked = useRef(false);
  useEffect(() => {
    if (initialFocusAsked.current || media._type !== 'tvshow' || initialSeason === undefined)
      return;
    initialFocusAsked.current = true;
    if (activeSeasonNumber === null)
      dispatch(detailsNavigationActions.setActiveSeasonNumber(initialSeason));
    // The remembered episode's season may not be the opening one: load it so its episode mounts
    if (selectedEpisode) requestSeason(selectedEpisode.seasonNumber);
    focusWhenReady(
      selectedEpisode
        ? episodeNavId(selectedEpisode.seasonNumber, selectedEpisode.episodeNumber)
        : seasonNavId(activeSeasonNumber ?? initialSeason),
      initialFocusFrom.current
    );
  }, [
    activeSeasonNumber,
    dispatch,
    focusWhenReady,
    initialSeason,
    media._type,
    requestSeason,
    selectedEpisode,
  ]);

  // Choosing a season loads it, then focus goes to its episode to watch next
  const [jumpToSeason, setJumpToSeason] = useState<{
    seasonNumber: number;
    from: string | null;
  } | null>(null);
  useEffect(() => {
    if (jumpToSeason === null) return;
    const section = loadedSeasons[jumpToSeason.seasonNumber];
    if (!section || progress.isLoading) return;
    setJumpToSeason(null);
    const target = targetEpisodeForSeason(section);
    if (target)
      focusWhenReady(
        episodeNavId(jumpToSeason.seasonNumber, target.episodeNumber),
        jumpToSeason.from
      );
  }, [focusWhenReady, jumpToSeason, loadedSeasons, progress.isLoading, targetEpisodeForSeason]);

  const selectSeason = (seasonNumber: number) => {
    dispatch(detailsNavigationActions.setActiveSeasonNumber(seasonNumber));
    requestSeason(seasonNumber);
    setJumpToSeason({ seasonNumber, from: getActiveId() });
  };

  const retrySeason = (seasonNumber: number) => {
    selectSeason(seasonNumber);
    retrySeasonLoad(seasonNumber);
  };

  // A focused season keeps its neighbours loading, so choosing one rarely waits
  const focusedSeason = useActiveIdWithin(NAV.seasons);
  useEffect(() => {
    const index = seasons.findIndex(item => seasonNavId(item.seasonNumber) === focusedSeason);
    if (index < 0) return;
    for (const adjacent of seasons.slice(Math.max(0, index - 1), index + 2))
      requestSeason(adjacent.seasonNumber);
  }, [focusedSeason, requestSeason, seasons]);

  const nextSeason = useMemo(() => {
    const lastLoaded = loadedSections[loadedSections.length - 1]?.seasonNumber;
    if (lastLoaded === undefined) return undefined;
    return seasons[seasons.findIndex(item => item.seasonNumber === lastLoaded) + 1];
  }, [loadedSections, seasons]);
  const loadNextSeason = useCallback(() => {
    if (nextSeason) requestSeason(nextSeason.seasonNumber);
  }, [nextSeason, requestSeason]);

  // The focused episode is remembered for coming back from the player, highlights its season,
  // and near the end of the loaded ones loads the next season
  const focusedEpisode = parseEpisodeNavId(useActiveIdWithin(EPISODES_GROUP));
  const focusedSeasonNumber = focusedEpisode?.seasonNumber;
  const focusedEpisodeNumber = focusedEpisode?.episodeNumber;
  useEffect(() => {
    if (focusedSeasonNumber === undefined || focusedEpisodeNumber === undefined) return;
    dispatch(
      detailsNavigationActions.selectEpisode({
        seasonNumber: focusedSeasonNumber,
        episodeNumber: focusedEpisodeNumber,
      })
    );
    const lastSection = loadedSections[loadedSections.length - 1];
    if (lastSection?.seasonNumber !== focusedSeasonNumber) return;
    const index = lastSection.episodes.findIndex(
      episode => episode.episodeNumber === focusedEpisodeNumber
    );
    if (index >= lastSection.episodes.length - LOAD_NEXT_WITHIN_EPISODES) loadNextSeason();
  }, [dispatch, focusedEpisodeNumber, focusedSeasonNumber, loadNextSeason, loadedSections]);

  const playEpisode = (seasonNumber: number, episodeNumber: number) => {
    dispatch(detailsNavigationActions.selectEpisode({ seasonNumber, episodeNumber }));
    onWatch({ kind: 'episode', showMediaId: media.mediaId, seasonNumber, episodeNumber });
  };

  const ratingItems: IconButtonGroupItem[] = [
    {
      id: 'watchlist',
      label: inWatchlist ? t('details.removeFromWatchlist') : t('details.addToWatchlist'),
      icon: inWatchlist ? <BookmarkIcon /> : <BookmarkOutlineIcon />,
      pressed: inWatchlist,
      // Busy, not disabled: disabling the focused button would drop focus
      loading: watchlistPending,
      onClick: () => {
        const item = { mediaType: watchlistType, mediaId: media.mediaId } as const;
        void (inWatchlist ? removeFromWatchlist(item) : addToWatchlist(item));
      },
    },
    ...(
      [
        ['dislike', t('details.dislike'), ThumbDownIcon, ThumbDownOutlineIcon],
        ['like', t('details.like'), ThumbUpIcon, ThumbUpOutlineIcon],
        ['love', t('details.love'), HeartIcon, HeartOutlineIcon],
      ] as const
    ).map(([value, label, OnIcon, OffIcon]) => ({
      id: value,
      label,
      icon: selectedRating === value ? <OnIcon /> : <OffIcon />,
      pressed: selectedRating === value,
      disabled: !savedRating.currentData,
      'aria-disabled': ratingPending || undefined,
      onClick: () => changeRating(value),
    })),
  ];

  const warmupId = `warmup-status-${media.mediaId}`;
  const watchAction =
    media._type !== 'movie' ? null : movieAvailability === 'unavailable' ? (
      <Button
        navId={NAV.watch}
        size="lg"
        icon={<BellIcon />}
        loading={availabilityRequest.isLoading}
        aria-describedby={warmupId}
        // Stays focusable for remote navigation once the request is saved
        aria-disabled={notifyRequested || undefined}
        onClick={() => {
          if (notifyRequested) return;
          void requestAvailability({ kind: 'movie', mediaId: media.mediaId });
        }}
      >
        {notifyRequested ? t('details.notificationSet') : t('details.notifyMe')}
      </Button>
    ) : (
      <Button
        navId={NAV.watch}
        size="lg"
        aria-describedby={warmupId}
        onClick={() => onWatch({ kind: 'movie', mediaId: media.mediaId })}
      >
        {movieProgress && movieProgress.state !== 'completed'
          ? t('details.resume')
          : t('details.watchNow')}
      </Button>
    );
  const warmupText =
    movieAvailability === 'unavailable'
      ? notifyRequested
        ? t('details.notifyPromised')
        : t('details.noSourceYet')
      : warmupDescription(warmupState, warmupDisplayPercent);

  const loading = media._type === 'movie' ? movie.isLoading : show.isLoading;
  const loadError = media._type === 'movie' ? movie.error : show.error;
  const hasEpisodes = media._type === 'tvshow' && !!showDetails;

  const info = (
    <ScrollArea>
      <FocusGroup id={NAV.info} layout="vertical">
        <div className={styles.info}>
          {detailLogo ? (
            <div className={styles.logoFrame}>
              <img
                className={styles.logo}
                decoding="async"
                src={artworkUrl(detailLogo, 'logo', 380)}
                alt={title}
              />
            </div>
          ) : (
            <div className={styles.title}>
              <Heading level={1} variant="display">
                {title}
              </Heading>
            </div>
          )}
          <div className={styles.facts}>
            {facts.map(fact => (
              <Fragment key={fact}>
                <span className={styles.fact}>{fact}</span>
                <span className={styles.dot} aria-hidden="true" />
              </Fragment>
            ))}
            {rating && (
              <span className={styles.fact}>
                <StarIcon className={styles.star} aria-hidden="true" />
                <span className={visuallyHidden}>Rating </span>
                {rating}
              </span>
            )}
            {media._type === 'movie' && (
              <SourcePreparationStatus
                mediaKind={media._type}
                mode="details"
                preparation={preparation}
                availability={movieAvailability}
              />
            )}
          </div>
          {current?.genres?.length ? (
            <div className={styles.genres}>
              <Text tone="secondary">{current.genres.join(' · ')}</Text>
            </div>
          ) : null}
          {loading && (
            <div className={styles.block}>
              <ProgressSpinner label={t('details.loading')} showLabel />
            </div>
          )}
          {loadError && (
            <div className={styles.block}>
              <Message tone="danger" toneLabel={t('common.error')} live="assertive">
                {errorText(loadError, t('details.loadFailed'))}
              </Message>
            </div>
          )}
          {current && (
            <div className={styles.overview}>
              <Text maxLines={4}>{current.overview || t('details.noOverview')}</Text>
            </div>
          )}
          <div className={styles.block}>
            <IconButtonGroup
              label={t('details.rate')}
              size="lg"
              navId={NAV.actions}
              items={ratingItems}
            />
          </div>
          {savedRating.isError && (
            <div className={styles.block}>
              <Message
                tone="danger"
                toneLabel={t('common.error')}
                live="assertive"
                actions={
                  <Button navId={NAV.ratingRetry} onClick={() => void savedRating.refetch()}>
                    {t('common.retry')}
                  </Button>
                }
              >
                {errorText(savedRating.error, t('details.ratingLoadFailed'))}
              </Message>
            </div>
          )}
          {ratingUpdate.isError && (
            <div className={styles.block}>
              <Message tone="danger" toneLabel={t('common.error')} live="assertive">
                {errorText(ratingUpdate.error, t('details.ratingSaveFailed'))}
              </Message>
            </div>
          )}
          {watchAction && (
            <div className={styles.watch}>
              {watchAction}
              {(warmupState === 'warming' || warmupState === 'paused') &&
                movieAvailability !== 'unavailable' && (
                  <div className={styles.warmup} data-warmup-state={warmupState}>
                    <ProgressBar decorative size="sm" value={warmupPercent / 100} />
                  </div>
                )}
              <span id={warmupId} className={visuallyHidden}>
                {warmupText}
              </span>
            </div>
          )}
          {media._type === 'movie' &&
            movieAvailability === 'unavailable' &&
            notifyRequestedHere &&
            availabilityRequest.isError && (
              <div className={styles.block}>
                <Message tone="danger" toneLabel={t('common.error')} live="assertive">
                  {t('details.notifyFailed')}
                </Message>
              </div>
            )}
          {hasEpisodes && (
            <nav className={styles.seasons} aria-labelledby={`${NAV.seasons}-heading`}>
              <Heading level={2} id={`${NAV.seasons}-heading`}>
                {t('details.seasons')}
              </Heading>
              <FocusGroup id={NAV.seasons} layout="vertical">
                <div className={styles.seasonList}>
                  {seasons.map(item => {
                    const selected = activeSeasonNumber === item.seasonNumber;
                    return (
                      <div key={item.id} className={styles.seasonItem}>
                        <Button
                          navId={seasonNavId(item.seasonNumber)}
                          // Over media a selection is carried by its icon
                          icon={selected ? <CheckIcon /> : undefined}
                          selected={selected}
                          aria-current={selected || undefined}
                          onClick={() => selectSeason(item.seasonNumber)}
                        >
                          {item.name}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </FocusGroup>
            </nav>
          )}
        </div>
      </FocusGroup>
    </ScrollArea>
  );

  return (
    <main ref={pageRef} className={styles.page} aria-label={t('details.label', { title })}>
      <div
        className={styles.backdrop}
        style={{
          backgroundImage: backdrop ? `url(${JSON.stringify(backdrop)})` : undefined,
          backgroundPosition: backdropPlacement.position,
          backgroundSize: backdropPlacement.size,
        }}
      />
      <div className={styles.scrim} data-episodes={hasEpisodes || undefined} />
      <FocusScope
        id={NAV.scope}
        layout="horizontal"
        initialId={media._type === 'movie' ? NAV.watch : NAV.info}
      >
        <div className={styles.rail}>
          <NavRail label={t('details.rail')} navId={NAV.rail}>
            <NavItem
              navId={NAV.back}
              icon={<ArrowLeftIcon />}
              label={t('details.backToBrowse')}
              onClick={onBack}
            />
          </NavRail>
        </div>
        <SurfaceContextProvider value="overMedia">
          <div className={styles.body}>
            <FocusGroup id={NAV.content} layout={stacked ? 'vertical' : 'horizontal'}>
              <SplitLayout
                fill
                split="narrow"
                stackBelow="expanded"
                gap="2xl"
                start={info}
                end={
                  hasEpisodes ? (
                    <EpisodesSection
                      showMediaId={media.mediaId}
                      seasons={seasons}
                      sections={loadedSections}
                      loading={showSeasons.loading}
                      failedSeasons={showSeasons.failedSeasons}
                      progress={progress.data?.progress ?? []}
                      fallbackStill={current?.backdrop}
                      onPlay={playEpisode}
                      onRetrySeason={retrySeason}
                      hasMore={!!nextSeason}
                      onMore={loadNextSeason}
                      onNearEnd={loadNextSeason}
                      pushedAvailability={pushedEpisodeAvailability}
                    />
                  ) : undefined
                }
              />
            </FocusGroup>
          </div>
        </SurfaceContextProvider>
      </FocusScope>
    </main>
  );
}

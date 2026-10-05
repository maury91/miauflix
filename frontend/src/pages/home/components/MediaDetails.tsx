import {
  useEnsureBackdropFocusMutation,
  useGetMovieQuery,
  useGetShowQuery,
  useLazyGetSeasonQuery,
} from '@features/media/api/media.api';
import { progressForPlayable, useGetProgressQuery } from '@features/progress/api/progress.api';
import type {
  MediaDto,
  PlayableRef,
  PreloadPreparationSnapshot,
  SeasonResponse,
} from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import { Button as BaseButton } from '@shared/ui/button/Button';
import { forwardRef, type UIEvent } from 'react';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

import type { BackdropPositionContext } from '../backdrop-focus';
import { getBackdropPlacement } from '../backdrop-focus';
import { type HomeAction, type NavigationOutcome } from '../homeNavigation';
import { getImageUrl, getMediaTitle } from '../media.utils';
import { SourcePreparationStatus } from './SourcePreparationStatus';

import CardsHeartIcon from '~icons/mdi/cards-heart-outline';
import ThumbDownIcon from '~icons/mdi/thumb-down-outline';
import ThumbUpIcon from '~icons/mdi/thumb-up-outline';

const Page = styled.main<{ $backdrop: string; $position: string; $size: string }>`
  position: absolute;
  inset: 0;
  z-index: 3;
  overflow: hidden;
  padding: 15vh 5vw 5vh;
  background: #000;
  outline: none;

  &::before {
    position: absolute;
    inset: 0;
    z-index: -3;
    content: '';
    background: url(${({ $backdrop }) => JSON.stringify($backdrop)})
      ${({ $position }) => $position} / ${({ $size }) => $size} no-repeat;
  }

  &::after {
    position: absolute;
    inset: 0;
    z-index: -2;
    pointer-events: none;
    content: '';
    background:
      linear-gradient(
        90deg,
        #000 0%,
        rgba(0, 0, 0, 0.94) 29%,
        rgba(0, 0, 0, 0.22) 57%,
        rgba(0, 0, 0, 0.92) 100%
      ),
      linear-gradient(0deg, #000 0%, transparent 30%),
      linear-gradient(180deg, rgba(0, 0, 0, 0.55), transparent 18%);
  }

  @media (max-width: 860px) {
    overflow: hidden auto;
    padding: 13vh 6vw 7vh;

    &::after {
      background:
        linear-gradient(90deg, rgba(0, 0, 0, 0.96), rgba(0, 0, 0, 0.56) 80%, rgba(0, 0, 0, 0.92)),
        linear-gradient(0deg, #000 0%, transparent 35%);
    }
  }
`;

const Header = styled.header`
  position: fixed;
  top: 3vh;
  left: 2vw;
  z-index: 4;

  @media (max-width: 860px) {
    top: 3vh;
    left: 6vw;
  }
`;

const BackButton = styled(BaseButton)`
  min-width: 0;
  min-height: 0;
  min-height: 4.5vh;
  padding: 0.8vh 1.2vw;
  border: 0.2vh solid ${PALETTE.background.border};
  border-radius: 0.6vh;
  background: rgba(17, 23, 25, 0.92);
  color: ${PALETTE.text.primary};
  box-shadow: none;
  font:
    600 clamp(0.8rem, 1.8vh, 1rem) 'Poppins',
    sans-serif;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    border-color: ${PALETTE.color.interactive};
    background: ${PALETTE.color.interactiveSubtle};
    outline: none;
  }
`;

const Layout = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 34vw) minmax(360px, 1fr);
  gap: clamp(2rem, 5vw, 6rem);
  height: 100%;
  min-height: 0;

  @media (max-width: 860px) {
    display: block;
    height: auto;
  }
`;

const Content = styled.div`
  min-width: 0;
  overflow: hidden auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Logo = styled.img`
  display: block;
  width: min(25vw, 380px);
  max-height: 13vh;
  margin-bottom: 2vh;
  object-fit: contain;
  object-position: left bottom;
`;

const Title = styled.h1`
  margin: 0 0 1vh;
  font-size: clamp(2.4rem, 5vh, 4.8rem);
  line-height: 1;
  font-weight: 600;
`;

const Metadata = styled.div`
  margin: 0 0 1.2vh;
  color: ${PALETTE.text.secondary};
  font-size: clamp(0.9rem, 2.3vh, 1.25rem);
`;

const MetadataLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;

  > ${Metadata} {
    margin-bottom: 0;
  }
`;

const MetadataSeparator = styled.span`
  margin: 0 0.2rem;
  color: ${PALETTE.text.secondary};
`;

const MetadataRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;

  @media (max-width: 860px) {
    flex-wrap: wrap;
    gap: 0.35rem;
  }
`;

const MetadataBlock = styled.div`
  flex: 1 1 20rem;
  min-width: 0;
`;

const Overview = styled.p`
  max-width: 65ch;
  margin: 2vh 0;
  color: ${PALETTE.text.primary};
  font-size: clamp(1rem, 2.4vh, 1.35rem);
  line-height: 1.55;
`;

const SectionLabel = styled.h2`
  margin: 3vh 0 1vh;
  font-size: clamp(1rem, 2.5vh, 1.45rem);
  font-weight: 500;
`;

const SeasonMenu = styled.nav`
  display: grid;
  gap: 0.65vh;
  max-height: 30vh;
  overflow: auto;
  padding-right: 0.4vw;
  scrollbar-width: thin;

  @media (max-width: 860px) {
    display: flex;
    max-height: none;
    overflow-x: auto;
    padding-bottom: 0.8vh;
  }
`;

const SeasonButton = styled(BaseButton)<{ $selected: boolean; $focused: boolean }>`
  min-width: 0;
  min-height: 4.8vh;
  padding: 0.9vh 1vw;
  border: 0.2vh solid
    ${({ $focused, $selected }) =>
      $focused || $selected ? PALETTE.color.interactive : PALETTE.background.border};
  border-left-width: 0.55vh;
  border-radius: 0.55vh;
  background: ${({ $selected }) =>
    $selected ? PALETTE.color.interactiveSubtle : 'rgba(17, 23, 25, 0.76)'};
  color: ${PALETTE.text.primary};
  font:
    600 clamp(0.85rem, 2vh, 1.2rem) 'Poppins',
    sans-serif;
  text-align: left;
  cursor: pointer;
  box-shadow: none;

  @media (max-width: 860px) {
    flex: 0 0 auto;
    min-width: 9rem;
  }
`;

const EpisodePane = styled.section`
  min-width: 0;
  height: 100%;
  overflow: hidden;

  @media (max-width: 860px) {
    height: 60vh;
    margin-top: 4vh;
  }
`;

const EpisodeList = styled.div`
  height: calc(100% - 3.5rem);
  overflow: auto;
  padding: 0.5rem 0.4rem 8vh 0;
  scrollbar-width: thin;
  scrollbar-color: ${PALETTE.background.border} transparent;
`;

const SeasonSection = styled.section`
  scroll-margin-top: 1rem;
  margin-bottom: 2.5vh;
`;

const EpisodeHeading = styled.h3`
  margin: 0 0 0.8vh;
  color: ${PALETTE.text.primary};
  font-size: clamp(1rem, 2.5vh, 1.4rem);
`;

const EpisodeRow = styled(BaseButton)<{ $selected: boolean; $image: string }>`
  display: grid;
  grid-template-columns: minmax(150px, 18vw) 1fr;
  width: 100%;
  min-height: 10vh;
  margin-bottom: 0.8vh;
  padding: 0;
  overflow: hidden;
  border: 0.25vh solid
    ${({ $selected }) => ($selected ? PALETTE.color.interactive : 'rgba(255, 255, 255, 0.14)')};
  border-radius: 0.6vh;
  background: rgba(17, 23, 25, 0.8);
  color: ${PALETTE.text.primary};
  text-align: left;
  cursor: pointer;
  box-shadow: none;

  &::before {
    display: block;
    min-height: 10vh;
    content: '';
    background:
      url(${({ $image }) => $image}) center / cover no-repeat,
      ${PALETTE.background.surface2};
  }

  &:focus-visible {
    outline: 0.3vh solid ${PALETTE.color.interactive};
    outline-offset: 0.2vh;
  }

  @media (max-width: 860px) {
    grid-template-columns: 38vw 1fr;
  }
`;

const EpisodeCaption = styled.span`
  align-self: center;
  padding: 1rem;
  font-size: clamp(0.85rem, 2vh, 1.1rem);
  font-weight: 600;
`;

const ProgressMark = styled.span`
  display: block;
  margin-top: 0.5rem;
  color: ${PALETTE.text.secondary};
  font-size: 0.78em;
  font-weight: 400;
`;

const ErrorState = styled.div`
  padding: 3vh 0;
  color: ${PALETTE.text.secondary};
`;

const PrimaryAction = styled(BaseButton)<{ $selected: boolean }>`
  min-width: 0;
  min-height: 5vh;
  padding: 1vh 1.6vw;
  border: 0.25vh solid
    ${({ $selected }) => ($selected ? PALETTE.color.interactive : PALETTE.background.border)};
  border-radius: 0.7vh;
  background: ${({ $selected }) =>
    $selected ? PALETTE.color.interactive : PALETTE.background.surface2};
  color: ${PALETTE.text.primary};
  font:
    600 clamp(0.9rem, 2.1vh, 1.2rem) 'Poppins',
    sans-serif;
  cursor: pointer;
  box-shadow: none;
`;

const WatchAction = styled(PrimaryAction)`
  border-color: transparent;
`;

type WarmupState = PreloadPreparationSnapshot['warmup']['state'];

const WarmupBorder = styled.div<{ $progress: number; $state: WarmupState }>`
  display: inline-flex;
  margin-top: 4vh;
  padding: ${({ $state }) => ($state === 'not_requested' ? '0' : '0.32vh')};
  border-radius: 0.9vh;
  background: ${({ $progress, $state }) => {
    if ($state === 'not_requested') return 'transparent';
    const color =
      $state === 'ready'
        ? PALETTE.text.primary
        : $state === 'failed'
          ? PALETTE.color.danger
          : $state === 'paused'
            ? PALETTE.color.warning
            : PALETTE.color.interactive;
    return `conic-gradient(from -90deg, ${color} 0 ${$progress}%, rgba(166, 173, 175, 0.4) ${$progress}% 100%)`;
  }};
  box-shadow: ${({ $state }) =>
    $state === 'not_requested' ? 'none' : `0 0 0.9vh ${PALETTE.color.interactiveSubtle}`};
  transition:
    background 180ms ease,
    filter 180ms ease;

  ${({ $state }) =>
    $state === 'warming'
      ? `
          animation: warmup-pulse 1.4s ease-in-out infinite alternate;

          @keyframes warmup-pulse {
            from { filter: brightness(0.85); }
            to { filter: brightness(1.2); }
          }
        `
      : ''}

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

const WarmupDescription = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const RatingActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  column-gap: 1.25rem;
  row-gap: 0.7rem;
  margin: 2vh 0;
`;

const RatingAction = styled(BaseButton)<{ $selected: boolean }>`
  gap: 0.5rem;
  min-width: 0;
  min-height: 4.5vh;
  padding: 0.75vh 1vw;
  border: 0.2vh solid
    ${({ $selected }) => ($selected ? PALETTE.color.interactive : PALETTE.background.border)};
  border-radius: 0.6vh;
  background: ${({ $selected }) =>
    $selected ? PALETTE.color.interactiveSubtle : 'rgba(17, 23, 25, 0.76)'};
  color: ${PALETTE.text.primary};
  font:
    500 clamp(0.78rem, 1.8vh, 1rem) 'Poppins',
    sans-serif;
  box-shadow: none;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    border-color: ${PALETTE.color.interactive};
    outline: none;
  }

  svg {
    width: 1.25em;
    height: 1.25em;
  }
`;

interface MediaDetailsProps {
  media: MediaDto;
  onWatch: (playable: PlayableRef) => void;
  onBack: () => void;
  preparation?: PreloadPreparationSnapshot | null;
}

export interface MediaDetailsHandle {
  handleAction: (action: HomeAction) => NavigationOutcome;
}

const formatYear = (value: string | null | undefined) => value?.slice(0, 4) ?? '';
const episodeKey = (seasonNumber: number, episodeNumber: number) =>
  `${seasonNumber}:${episodeNumber}`;

/** Describe torrent warmup for assistive text; progress is an already formatted percentage. */
function warmupDescription(state: WarmupState, progress: number): string {
  switch (state) {
    case 'warming':
      return `Warming up torrent, ${progress}% ready`;
    case 'ready':
      return 'Torrent warmup ready';
    case 'paused':
      return 'Torrent warmup paused';
    case 'failed':
      return 'Torrent warmup failed';
    case 'not_requested':
    default:
      return 'Torrent warmup not requested';
  }
}

/** Show movie preparation or selectable show episodes, exposing directional navigation through the ref. */
export const MediaDetails = forwardRef<MediaDetailsHandle, MediaDetailsProps>(function MediaDetails(
  { media, onBack, onWatch, preparation = null },
  forwardedRef
) {
  const [ensureBackdropFocus] = useEnsureBackdropFocusMutation();
  const [loadSeason] = useLazyGetSeasonQuery();
  const progress = useGetProgressQuery(undefined);
  const pageRef = useRef<HTMLElement>(null);
  const episodeListRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<number, HTMLElement>());
  const inflight = useRef(new Map<number, Promise<SeasonResponse | undefined>>());
  const currentMediaId = useRef(media.mediaId);
  currentMediaId.current = media.mediaId;
  const jumpToSeason = useRef<number | null>(null);
  const [resolvedBackdropFocus, setResolvedBackdropFocus] = useState(media.backdropFocus);
  const [backdropContext, setBackdropContext] = useState<BackdropPositionContext>();
  const [focusedArea, setFocusedArea] = useState<'action' | 'season' | 'episodes'>(
    media._type === 'movie' ? 'action' : 'season'
  );
  const [focusedSeasonIndex, setFocusedSeasonIndex] = useState(0);
  const [activeSeasonNumber, setActiveSeasonNumber] = useState<number | null>(null);
  const [selectedEpisode, setSelectedEpisode] = useState<{
    seasonNumber: number;
    episodeNumber: number;
  } | null>(null);
  const [selectedRating, setSelectedRating] = useState<'dislike' | 'like' | 'love' | null>(null);
  const [loadedSeasons, setLoadedSeasons] = useState<Record<number, SeasonResponse>>({});
  const [seasonErrors, setSeasonErrors] = useState<Record<number, boolean>>({});
  const [loadingSeasons, setLoadingSeasons] = useState<Record<number, boolean>>({});

  const movie = useGetMovieQuery(media._type === 'movie' ? media.mediaId : skipToken);
  const show = useGetShowQuery(media._type === 'tvshow' ? media.mediaId : skipToken);
  const showDetails = show.data;
  const movieProgress =
    media._type === 'movie'
      ? progressForPlayable(progress.data?.progress ?? [], {
          kind: 'movie',
          mediaId: media.mediaId,
        })
      : undefined;
  const seasons = useMemo(() => showDetails?.seasons ?? [], [showDetails?.seasons]);

  useEffect(() => {
    setSelectedRating(null);
  }, [media._type, media.mediaId]);

  const loadSeasonData = useCallback(
    (seasonNumber: number) => {
      const cached = loadedSeasons[seasonNumber];
      if (cached) return Promise.resolve(cached);
      const pending = inflight.current.get(seasonNumber);
      if (pending) return pending;
      const requestMediaId = media.mediaId;
      setLoadingSeasons(previous => ({ ...previous, [seasonNumber]: true }));
      const request = loadSeason({ showId: requestMediaId, season: seasonNumber })
        .unwrap()
        .then(data => {
          if (
            currentMediaId.current !== requestMediaId ||
            inflight.current.get(seasonNumber) !== request
          ) {
            return undefined;
          }
          setLoadedSeasons(previous => ({ ...previous, [seasonNumber]: data }));
          setSeasonErrors(previous => ({ ...previous, [seasonNumber]: false }));
          return data;
        })
        .catch(() => {
          if (
            currentMediaId.current !== requestMediaId ||
            inflight.current.get(seasonNumber) !== request
          ) {
            return undefined;
          }
          setSeasonErrors(previous => ({ ...previous, [seasonNumber]: true }));
          return undefined;
        })
        .finally(() => {
          if (inflight.current.get(seasonNumber) !== request) return;
          inflight.current.delete(seasonNumber);
          if (currentMediaId.current !== requestMediaId) return;
          setLoadingSeasons(previous => ({ ...previous, [seasonNumber]: false }));
        });
      inflight.current.set(seasonNumber, request);
      return request;
    },
    [loadedSeasons, loadSeason, media.mediaId]
  );

  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
  }, [media]);

  useEffect(() => {
    document.body.dataset['miauflixDetails'] = 'true';
    return () => {
      delete document.body.dataset['miauflixDetails'];
    };
  }, []);

  useEffect(() => {
    setFocusedArea(media._type === 'movie' ? 'action' : 'season');
    setFocusedSeasonIndex(0);
    setActiveSeasonNumber(null);
    setSelectedEpisode(null);
    setLoadedSeasons({});
    setSeasonErrors({});
    setLoadingSeasons({});
    inflight.current.clear();
    jumpToSeason.current = null;
  }, [media]);

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
  }, [ensureBackdropFocus, media]);

  useEffect(() => {
    if (media._type === 'tvshow' && seasons[0]) {
      setActiveSeasonNumber(previous => previous ?? seasons[0].seasonNumber);
      if (!selectedEpisode) jumpToSeason.current = seasons[0].seasonNumber;
      void loadSeasonData(seasons[0].seasonNumber);
    }
  }, [loadSeasonData, media._type, seasons, selectedEpisode]);

  useEffect(() => {
    const season = seasons[focusedSeasonIndex];
    if (!season || focusedArea !== 'season') return;
    document
      .getElementById(`season-${media.mediaId}-${season.seasonNumber}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [focusedArea, focusedSeasonIndex, media.mediaId, seasons]);

  const current = media._type === 'movie' ? movie.data : showDetails;
  const title = current?.title ?? getMediaTitle(media);
  const backdrop = getImageUrl(current?.backdrop ?? media.backdrop, 'w1280');
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
    const image = new window.Image();
    const update = () => {
      if (cancelled || image.naturalWidth <= 0 || image.naturalHeight <= 0) return;
      const bounds = element.getBoundingClientRect();
      setBackdropContext({
        imageWidth: image.naturalWidth,
        imageHeight: image.naturalHeight,
        containerWidth: bounds.width,
        containerHeight: bounds.height,
        targetX: 0.51,
        targetY: 0.482,
        maxZoom: 1.25,
      });
    };
    image.onload = update;
    image.src = backdrop;
    if (image.complete) update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener('resize', update);
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [backdrop]);

  const metadata = useMemo(() => {
    if (!current) return [];
    if (current.type === 'movie') {
      return [
        formatYear(current.releaseDate),
        current.runtime ? `${current.runtime} min` : '',
        current.rating ? `★ ${current.rating.toFixed(1)}` : '',
      ].filter(Boolean);
    }
    return [
      formatYear(current.firstAirDate),
      current.seasons.length ? `${current.seasons.length} seasons` : '',
      current.rating ? `★ ${current.rating.toFixed(1)}` : '',
    ].filter(Boolean);
  }, [current]);

  const loadedSections = useMemo(
    () => seasons.map(item => loadedSeasons[item.seasonNumber]).filter(Boolean) as SeasonResponse[],
    [loadedSeasons, seasons]
  );
  const flatEpisodes = useMemo(
    () =>
      loadedSections.flatMap(section => section.episodes.map(episode => ({ section, episode }))),
    [loadedSections]
  );

  const targetEpisodeForSeason = useCallback(
    (season: SeasonResponse) => {
      const watched = (progress.data?.progress ?? [])
        .filter(
          entry =>
            entry.playable.kind === 'episode' &&
            entry.playable.showMediaId === media.mediaId &&
            entry.playable.seasonNumber === season.seasonNumber
        )
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
      if (watched?.playable.kind === 'episode') {
        const matching = season.episodes.find(
          episode => episode.episodeNumber === watched.playable.episodeNumber
        );
        if (matching) return matching;
      }
      return season.episodes[0];
    },
    [media.mediaId, progress.data?.progress]
  );

  useEffect(() => {
    const requested = jumpToSeason.current;
    if (requested === null) return;
    const section = loadedSeasons[requested];
    if (!section || progress.isLoading) return;
    jumpToSeason.current = null;
    const target = targetEpisodeForSeason(section);
    if (!target) return;
    setSelectedEpisode({ seasonNumber: requested, episodeNumber: target.episodeNumber });
    requestAnimationFrame(() =>
      document
        .getElementById(`episode-${media.mediaId}-${episodeKey(requested, target.episodeNumber)}`)
        ?.scrollIntoView({ block: 'nearest' })
    );
  }, [loadedSeasons, media.mediaId, progress.isLoading, targetEpisodeForSeason]);

  const selectSeason = useCallback(
    (index: number) => {
      const item = seasons[index];
      if (!item) return;
      setFocusedSeasonIndex(index);
      setActiveSeasonNumber(item.seasonNumber);
      setFocusedArea('episodes');
      jumpToSeason.current = item.seasonNumber;
      void loadSeasonData(item.seasonNumber);
    },
    [loadSeasonData, seasons]
  );

  const selectEpisode = useCallback(
    (seasonNumber: number, episodeNumber: number, play = false) => {
      setActiveSeasonNumber(seasonNumber);
      setSelectedEpisode({ seasonNumber, episodeNumber });
      setFocusedArea('episodes');
      requestAnimationFrame(() =>
        document
          .getElementById(`episode-${media.mediaId}-${episodeKey(seasonNumber, episodeNumber)}`)
          ?.scrollIntoView({ block: 'nearest' })
      );
      if (play)
        onWatch({ kind: 'episode', showMediaId: media.mediaId, seasonNumber, episodeNumber });
    },
    [media.mediaId, onWatch]
  );

  const handleEpisodeScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const top = event.currentTarget.getBoundingClientRect().top + 24;
      let currentSeason: number | null = null;
      sectionRefs.current.forEach((node, seasonNumber) => {
        if (node.getBoundingClientRect().top <= top) currentSeason = seasonNumber;
      });
      if (currentSeason !== null) setActiveSeasonNumber(currentSeason);
      const element = event.currentTarget;
      if (
        element.scrollTop + element.clientHeight >=
        element.scrollHeight - element.clientHeight * 1.5
      ) {
        const lastLoaded = loadedSections[loadedSections.length - 1]?.seasonNumber;
        const next = seasons.findIndex(item => item.seasonNumber === lastLoaded) + 1;
        if (next > 0 && seasons[next]) void loadSeasonData(seasons[next].seasonNumber);
      }
    },
    [loadSeasonData, loadedSections, seasons]
  );

  const handleAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      if (media._type === 'movie') {
        if (action === 'confirm') {
          onWatch({ kind: 'movie', mediaId: media.mediaId });
          return { type: 'handled' };
        }
        return action === 'back' ? { type: 'escape', direction: 'left' } : { type: 'handled' };
      }
      if (media._type !== 'tvshow' || seasons.length === 0)
        return action === 'back' ? { type: 'escape', direction: 'left' } : { type: 'handled' };
      if (focusedArea === 'season') {
        if (action === 'up') setFocusedSeasonIndex(index => Math.max(0, index - 1));
        else if (action === 'down')
          setFocusedSeasonIndex(index => Math.min(seasons.length - 1, index + 1));
        else if (action === 'right') setFocusedArea('episodes');
        else if (action === 'confirm') selectSeason(focusedSeasonIndex);
        else if (action === 'back') return { type: 'escape', direction: 'left' };
        return { type: 'handled' };
      }
      const currentIndex = selectedEpisode
        ? flatEpisodes.findIndex(
            item =>
              episodeKey(item.section.seasonNumber, item.episode.episodeNumber) ===
              episodeKey(selectedEpisode.seasonNumber, selectedEpisode.episodeNumber)
          )
        : 0;
      if (action === 'left') {
        setFocusedArea('season');
        return { type: 'handled' };
      }
      if (action === 'up' || action === 'down') {
        const nextIndex = Math.max(
          0,
          Math.min(flatEpisodes.length - 1, currentIndex + (action === 'up' ? -1 : 1))
        );
        const next = flatEpisodes[nextIndex];
        if (next) selectEpisode(next.section.seasonNumber, next.episode.episodeNumber);
        else if (action === 'down') {
          const last = loadedSections[loadedSections.length - 1]?.seasonNumber;
          const nextSeason = seasons.findIndex(item => item.seasonNumber === last) + 1;
          if (nextSeason > 0 && seasons[nextSeason]) {
            jumpToSeason.current = seasons[nextSeason].seasonNumber;
            void loadSeasonData(seasons[nextSeason].seasonNumber);
          }
        }
        return { type: 'handled' };
      }
      if (action === 'confirm') {
        const current = flatEpisodes[currentIndex];
        if (current)
          selectEpisode(current.section.seasonNumber, current.episode.episodeNumber, true);
        return { type: 'handled' };
      }
      if (action === 'back') return { type: 'escape', direction: 'left' };
      return { type: 'ignored' };
    },
    [
      flatEpisodes,
      focusedArea,
      focusedSeasonIndex,
      loadSeasonData,
      loadedSections,
      media,
      onWatch,
      seasons,
      selectEpisode,
      selectSeason,
      selectedEpisode,
    ]
  );

  useImperativeHandle(forwardedRef, () => ({ handleAction }), [handleAction]);

  return (
    <>
      <Header>
        <BackButton type="button" onClick={onBack} aria-label="Back to browse">
          Back
        </BackButton>
      </Header>
      <Page
        ref={pageRef}
        tabIndex={-1}
        $backdrop={backdrop}
        $position={backdropPlacement.position}
        $size={backdropPlacement.size}
        aria-label={`${title} details`}
      >
        <Layout>
          <Content>
            {current?.logo ? (
              <Logo src={getImageUrl(current.logo)} alt={title} />
            ) : (
              <Title>{title}</Title>
            )}
            <MetadataRow>
              <MetadataBlock>
                <MetadataLine>
                  <Metadata>
                    {metadata.map((item, index) => (
                      <span key={item}>
                        {index > 0 && <MetadataSeparator aria-hidden="true">·</MetadataSeparator>}
                        {item}
                      </span>
                    ))}
                  </Metadata>
                  {media._type === 'movie' && (
                    <>
                      <MetadataSeparator aria-hidden="true">·</MetadataSeparator>
                      <SourcePreparationStatus
                        mediaKind={media._type}
                        mode="details"
                        preparation={preparation}
                      />
                    </>
                  )}
                </MetadataLine>
                {current?.genres?.length ? <Metadata>{current.genres.join(' · ')}</Metadata> : null}
              </MetadataBlock>
            </MetadataRow>
            {(media._type === 'movie' ? movie.isLoading : show.isLoading) && (
              <Spinner text="Loading details..." />
            )}
            {(media._type === 'movie' ? movie.isError : show.isError) && (
              <ErrorState>Failed to load details.</ErrorState>
            )}
            {current && <Overview>{current.overview || 'No overview available.'}</Overview>}
            <RatingActions aria-label="Rate this title">
              <RatingAction
                type="button"
                $selected={selectedRating === 'dislike'}
                aria-pressed={selectedRating === 'dislike'}
                aria-label="Don't like it"
                onClick={() =>
                  setSelectedRating(currentRating =>
                    currentRating === 'dislike' ? null : 'dislike'
                  )
                }
              >
                <ThumbDownIcon aria-hidden="true" />
                Don&apos;t like it
              </RatingAction>
              <RatingAction
                type="button"
                $selected={selectedRating === 'like'}
                aria-pressed={selectedRating === 'like'}
                aria-label="Like it"
                onClick={() =>
                  setSelectedRating(currentRating => (currentRating === 'like' ? null : 'like'))
                }
              >
                <ThumbUpIcon aria-hidden="true" />
                Like it
              </RatingAction>
              <RatingAction
                type="button"
                $selected={selectedRating === 'love'}
                aria-pressed={selectedRating === 'love'}
                aria-label="Love it"
                onClick={() =>
                  setSelectedRating(currentRating => (currentRating === 'love' ? null : 'love'))
                }
              >
                <CardsHeartIcon aria-hidden="true" />
                Love it
              </RatingAction>
            </RatingActions>
            {media._type === 'movie' && (
              <WarmupBorder
                $progress={warmupPercent}
                $state={warmupState}
                data-warmup-state={warmupState}
                data-warmup-progress={warmupPercent}
              >
                <WatchAction
                  type="button"
                  $selected={focusedArea === 'action'}
                  aria-describedby={`warmup-status-${media.mediaId}`}
                  onMouseEnter={() => setFocusedArea('action')}
                  onClick={() => onWatch({ kind: 'movie', mediaId: media.mediaId })}
                >
                  {movieProgress && movieProgress.state !== 'completed'
                    ? 'Resume Watching'
                    : 'Watch Now'}
                </WatchAction>
                <WarmupDescription id={`warmup-status-${media.mediaId}`}>
                  {warmupDescription(warmupState, warmupDisplayPercent)}
                </WarmupDescription>
              </WarmupBorder>
            )}
            {media._type === 'tvshow' && showDetails && (
              <>
                <SectionLabel>Seasons</SectionLabel>
                <SeasonMenu aria-label="Seasons">
                  {seasons.map((item, index) => (
                    <SeasonButton
                      id={`season-${media.mediaId}-${item.seasonNumber}`}
                      key={item.id}
                      type="button"
                      $selected={activeSeasonNumber === item.seasonNumber}
                      $focused={focusedArea === 'season' && focusedSeasonIndex === index}
                      onMouseEnter={() => {
                        setFocusedArea('season');
                        setFocusedSeasonIndex(index);
                      }}
                      onClick={() => selectSeason(index)}
                    >
                      {item.name}
                    </SeasonButton>
                  ))}
                </SeasonMenu>
              </>
            )}
          </Content>
          {media._type === 'tvshow' && showDetails && (
            <EpisodePane>
              <SectionLabel>Episodes</SectionLabel>
              <EpisodeList
                ref={episodeListRef}
                aria-label="Episodes"
                onScroll={handleEpisodeScroll}
              >
                {loadedSections.map(section => (
                  <SeasonSection
                    key={section.seasonNumber}
                    ref={node => {
                      if (node) sectionRefs.current.set(section.seasonNumber, node);
                      else sectionRefs.current.delete(section.seasonNumber);
                    }}
                  >
                    <EpisodeHeading>{section.name}</EpisodeHeading>
                    {section.episodes.map(episode => {
                      const key = episodeKey(section.seasonNumber, episode.episodeNumber);
                      const selected =
                        selectedEpisode?.seasonNumber === section.seasonNumber &&
                        selectedEpisode.episodeNumber === episode.episodeNumber;
                      const watched = progressForPlayable(progress.data?.progress ?? [], {
                        kind: 'episode',
                        showMediaId: media.mediaId,
                        seasonNumber: section.seasonNumber,
                        episodeNumber: episode.episodeNumber,
                      });
                      return (
                        <EpisodeRow
                          id={`episode-${media.mediaId}-${key}`}
                          key={episode.id}
                          type="button"
                          $selected={selected}
                          $image={getImageUrl(episode.still ?? current?.backdrop)}
                          onMouseEnter={() =>
                            selectEpisode(section.seasonNumber, episode.episodeNumber)
                          }
                          onClick={() =>
                            selectEpisode(section.seasonNumber, episode.episodeNumber, true)
                          }
                        >
                          <EpisodeCaption>
                            E{episode.episodeNumber} · {episode.title}
                            {watched ? (
                              <ProgressMark>
                                {watched.state === 'completed'
                                  ? 'Watched'
                                  : `Resume ${Math.round(
                                      (watched.positionSeconds / watched.durationSeconds) * 100
                                    )}%`}
                              </ProgressMark>
                            ) : null}
                          </EpisodeCaption>
                        </EpisodeRow>
                      );
                    })}
                  </SeasonSection>
                ))}
                {Object.values(loadingSeasons).some(Boolean) && (
                  <Spinner text="Loading more episodes..." />
                )}
                {seasons.map((item, index) =>
                  seasonErrors[item.seasonNumber] && !loadedSeasons[item.seasonNumber] ? (
                    <ErrorState key={`error-${item.seasonNumber}`}>
                      Failed to load {item.name}.
                      <PrimaryAction
                        type="button"
                        $selected={false}
                        onClick={() => selectSeason(index)}
                      >
                        Retry
                      </PrimaryAction>
                    </ErrorState>
                  ) : null
                )}
              </EpisodeList>
            </EpisodePane>
          )}
        </Layout>
      </Page>
    </>
  );
});

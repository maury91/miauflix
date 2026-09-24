import {
  useGetMovieQuery,
  useGetSeasonQuery,
  useGetShowQuery,
} from '@features/media/api/media.api';
import type { MediaDto, SeasonResponse } from '@miauflix/backend';
import { skipToken } from '@reduxjs/toolkit/query';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import { forwardRef } from 'react';
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

import { type HomeAction, type NavigationOutcome } from '../homeNavigation';
import { getImageUrl, getMediaTitle } from '../media.utils';

const Page = styled.main<{ $backdrop: string }>`
  position: absolute;
  inset: 0;
  z-index: 3;
  overflow: hidden auto;
  padding: 16vh 5vw 8vh;
  background:
    linear-gradient(
      90deg,
      #000 0%,
      rgba(0, 0, 0, 0.92) 34%,
      rgba(0, 0, 0, 0.35) 66%,
      rgba(0, 0, 0, 0.14)
    ),
    linear-gradient(0deg, #000 0%, transparent 42%),
    url(${({ $backdrop }) => $backdrop}) center right / cover no-repeat,
    #000;
  outline: none;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Content = styled.div`
  width: min(48vw, 760px);
  min-width: min(620px, 80vw);
`;

const Logo = styled.img`
  display: block;
  width: min(25vw, 380px);
  max-height: 13vh;
  object-fit: contain;
  object-position: left bottom;
  margin-bottom: 2vh;
`;

const Title = styled.h1`
  margin: 0 0 1vh;
  font-size: clamp(2.4rem, 5vh, 4.8rem);
  line-height: 1;
  font-weight: 600;
  text-transform: none;
`;

const Metadata = styled.p`
  margin: 0 0 1.2vh;
  color: ${PALETTE.text.secondary};
  font-size: clamp(0.9rem, 2.3vh, 1.25rem);
`;

const Overview = styled.p`
  max-width: 65ch;
  margin: 2vh 0;
  color: ${PALETTE.text.primary};
  font-size: clamp(1rem, 2.4vh, 1.35rem);
  line-height: 1.55;
`;

const SectionLabel = styled.h2`
  margin: 4vh 0 1vh;
  font-size: clamp(1rem, 2.5vh, 1.45rem);
  font-weight: 500;
  text-transform: none;
`;

const SeasonButton = styled.button<{ $selected: boolean }>`
  min-width: 13vw;
  min-height: 5vh;
  padding: 1vh 1.4vw;
  border: 0.25vh solid
    ${({ $selected }) => ($selected ? PALETTE.color.interactive : PALETTE.background.border)};
  border-radius: 0.7vh;
  background: ${({ $selected }) =>
    $selected ? PALETTE.color.interactive : PALETTE.background.surface2};
  color: ${PALETTE.text.primary};
  font:
    600 clamp(0.85rem, 2vh, 1.2rem) 'Poppins',
    sans-serif;
  cursor: pointer;
`;

const SeasonMenu = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.8vw;
`;

const EpisodeRow = styled.div`
  display: flex;
  gap: 1vw;
  overflow-x: auto;
  padding: 0.8vh 0.3vw 1.5vh;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
`;

const Episode = styled.button<{ $selected: boolean; $image: string }>`
  position: relative;
  flex: 0 0 15vw;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  padding: 0;
  border: 0.35vh solid ${({ $selected }) => ($selected ? PALETTE.color.interactive : 'transparent')};
  border-radius: 0.7vh;
  background:
    url(${({ $image }) => $image}) center / cover no-repeat,
    ${PALETTE.background.surface2};
  color: ${PALETTE.text.primary};
  text-align: left;
  cursor: pointer;
`;

const EpisodeCaption = styled.span`
  position: absolute;
  inset: auto 0 0;
  padding: 2.2vh 0.7vw 0.7vh;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.92));
  font-size: clamp(0.75rem, 1.8vh, 1rem);
  font-weight: 600;
`;

const ErrorState = styled.div`
  padding: 3vh 0;
  color: ${PALETTE.text.secondary};
`;

export interface MediaDetailsHandle {
  handleAction: (action: HomeAction) => NavigationOutcome;
}

interface MediaDetailsProps {
  media: MediaDto;
}

const formatYear = (value: string | null | undefined) => value?.slice(0, 4) ?? '';

export const MediaDetails = forwardRef<MediaDetailsHandle, MediaDetailsProps>(function MediaDetails(
  { media },
  forwardedRef
) {
  const pageRef = useRef<HTMLElement>(null);
  const [focusArea, setFocusArea] = useState<'season' | 'episodes'>('season');
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [selectedSeasonIndex, setSelectedSeasonIndex] = useState(0);
  const [temporarySeasonIndex, setTemporarySeasonIndex] = useState(0);
  const [selectedEpisodeIndex, setSelectedEpisodeIndex] = useState(0);

  const movie = useGetMovieQuery(media._type === 'movie' ? media.mediaId : skipToken);
  const show = useGetShowQuery(media._type === 'tvshow' ? media.mediaId : skipToken);
  const showDetails = show.data;
  const seasons = showDetails?.seasons ?? [];
  const selectedSeason = seasons[selectedSeasonIndex];
  const season = useGetSeasonQuery(
    media._type === 'tvshow' && selectedSeason
      ? { showId: media.mediaId, season: selectedSeason.seasonNumber }
      : skipToken
  );

  useEffect(() => {
    pageRef.current?.focus({ preventScroll: true });
  }, [media]);

  useEffect(() => {
    setFocusArea('season');
    setSeasonOpen(false);
    setSelectedSeasonIndex(0);
    setTemporarySeasonIndex(0);
    setSelectedEpisodeIndex(0);
  }, [media]);

  useEffect(() => {
    setSelectedEpisodeIndex(0);
  }, [selectedSeasonIndex]);

  const commitSeason = useCallback((index: number) => {
    setSelectedSeasonIndex(index);
    setTemporarySeasonIndex(index);
    setSeasonOpen(false);
    setFocusArea('episodes');
  }, []);

  const handleAction = useCallback(
    (action: HomeAction): NavigationOutcome => {
      if (media._type !== 'tvshow')
        return action === 'back' ? { type: 'escape', direction: 'left' } : { type: 'handled' };
      if (!seasons.length)
        return action === 'back' ? { type: 'escape', direction: 'left' } : { type: 'handled' };

      if (seasonOpen) {
        if (action === 'up') {
          setTemporarySeasonIndex(index => Math.max(0, index - 1));
          return { type: 'handled' };
        }
        if (action === 'down') {
          setTemporarySeasonIndex(index => Math.min(seasons.length - 1, index + 1));
          return { type: 'handled' };
        }
        if (action === 'confirm') {
          commitSeason(temporarySeasonIndex);
          return { type: 'handled' };
        }
        if (action === 'back') {
          setSeasonOpen(false);
          return { type: 'handled' };
        }
        return { type: 'handled' };
      }

      if (focusArea === 'season') {
        if (action === 'up') {
          setSelectedSeasonIndex(index => Math.max(0, index - 1));
          return { type: 'handled' };
        }
        if (action === 'down' || action === 'right') {
          setFocusArea('episodes');
          return { type: 'handled' };
        }
        if (action === 'confirm') {
          setTemporarySeasonIndex(selectedSeasonIndex);
          setSeasonOpen(true);
          return { type: 'handled' };
        }
      } else {
        const episodeCount = season.data?.episodes.length ?? 0;
        if (action === 'left') {
          setSelectedEpisodeIndex(index => Math.max(0, index - 1));
          return { type: 'handled' };
        }
        if (action === 'right') {
          setSelectedEpisodeIndex(index => Math.min(Math.max(0, episodeCount - 1), index + 1));
          return { type: 'handled' };
        }
        if (action === 'up') {
          setFocusArea('season');
          return { type: 'handled' };
        }
        if (action === 'down' || action === 'confirm') return { type: 'handled' };
      }

      if (action === 'back') return { type: 'escape', direction: 'left' };
      return { type: 'ignored' };
    },
    [
      commitSeason,
      focusArea,
      media._type,
      season.data?.episodes.length,
      seasonOpen,
      seasons.length,
      selectedSeasonIndex,
      temporarySeasonIndex,
    ]
  );

  useImperativeHandle(forwardedRef, () => ({ handleAction }), [handleAction]);

  const current = media._type === 'movie' ? movie.data : showDetails;
  const isLoading = media._type === 'movie' ? movie.isLoading : show.isLoading;
  const isError = media._type === 'movie' ? movie.isError : show.isError;
  const title = current?.title ?? getMediaTitle(media);
  const backdrop = getImageUrl(current?.backdrop ?? media.backdrop, 'original');
  const metadata = useMemo(() => {
    if (!current) return '';
    if (current.type === 'movie') {
      return [
        formatYear(current.releaseDate),
        current.runtime ? `${current.runtime} min` : '',
        current.rating ? `★ ${current.rating.toFixed(1)}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
    }
    return [
      formatYear(current.firstAirDate),
      current.seasons.length ? `${current.seasons.length} seasons` : '',
      current.rating ? `★ ${current.rating.toFixed(1)}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }, [current]);

  return (
    <Page ref={pageRef} tabIndex={-1} $backdrop={backdrop} aria-label={`${title} details`}>
      <Content>
        {current?.logo ? (
          <Logo src={getImageUrl(current.logo)} alt={title} />
        ) : (
          <Title>{title}</Title>
        )}
        <Metadata>{metadata}</Metadata>
        {current?.genres?.length ? <Metadata>{current.genres.join(' · ')}</Metadata> : null}
        {isLoading && <Spinner text="Loading details..." />}
        {isError && <ErrorState>Failed to load details.</ErrorState>}
        {current && <Overview>{current.overview || 'No overview available.'}</Overview>}
        {media._type === 'tvshow' && showDetails && (
          <>
            <SectionLabel>Season</SectionLabel>
            <SeasonMenu aria-label="Seasons">
              <SeasonButton
                type="button"
                $selected={focusArea === 'season'}
                onMouseEnter={() => setFocusArea('season')}
                onClick={() => {
                  setTemporarySeasonIndex(selectedSeasonIndex);
                  setSeasonOpen(open => !open);
                }}
              >
                {seasons[selectedSeasonIndex]?.name ?? 'Season'}
              </SeasonButton>
              {seasonOpen &&
                seasons.map((item: SeasonResponse, index) => (
                  <SeasonButton
                    key={item.id}
                    type="button"
                    $selected={temporarySeasonIndex === index}
                    onMouseEnter={() => setTemporarySeasonIndex(index)}
                    onClick={() => commitSeason(index)}
                  >
                    {item.name}
                  </SeasonButton>
                ))}
            </SeasonMenu>
            <SectionLabel>Episodes</SectionLabel>
            {season.isLoading && <Spinner text="Loading episodes..." />}
            {season.isError && <ErrorState>Failed to load episodes.</ErrorState>}
            {season.data && (
              <EpisodeRow aria-label="Episodes">
                {season.data.episodes.map((episode, index) => (
                  <Episode
                    key={episode.id}
                    type="button"
                    $selected={focusArea === 'episodes' && selectedEpisodeIndex === index}
                    $image={getImageUrl(episode.still ?? current?.backdrop)}
                    onMouseEnter={() => {
                      setFocusArea('episodes');
                      setSelectedEpisodeIndex(index);
                    }}
                    onClick={() => setSelectedEpisodeIndex(index)}
                  >
                    <EpisodeCaption>
                      E{episode.episodeNumber} · {episode.title}
                    </EpisodeCaption>
                  </Episode>
                ))}
              </EpisodeRow>
            )}
          </>
        )}
      </Content>
    </Page>
  );
});

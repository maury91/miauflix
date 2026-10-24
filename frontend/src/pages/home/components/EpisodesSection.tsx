import { progressForPlayable } from '@features/progress/api/progress.api';
import type { ProgressEntry, SeasonResponse } from '@miauflix/backend';
import { Spinner } from '@shared/components';
import { PALETTE } from '@shared/config/constants';
import { Button as BaseButton } from '@shared/ui/button/Button';
import { type UIEvent, useCallback, useRef } from 'react';
import styled from 'styled-components';

import { artworkUrl } from '../media.utils';
import { ErrorState, PrimaryAction, SectionLabel } from './details.styles';
import { episodeElementId, episodeProgressLabel } from './episodes.utils';

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

// eslint-disable-next-line no-restricted-syntax -- Existing media/player interaction and TV-scaled chrome; see shared/ui/README.md.
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

/** Seasons further down than this many screens of scrolling start loading. */
const LOAD_NEXT_WITHIN_SCREENS = 1.5;

interface EpisodesSectionProps {
  showMediaId: number;
  /** Every season, in display order (for retry labels). */
  seasons: ReadonlyArray<{ seasonNumber: number; name: string }>;
  /** Loaded seasons, in display order. */
  sections: readonly SeasonResponse[];
  loading: boolean;
  /** Seasons whose load failed and that have nothing to show. */
  failedSeasons: readonly number[];
  selectedEpisode: { seasonNumber: number; episodeNumber: number } | null;
  progress: ProgressEntry[];
  /** Shown for episodes without a still. */
  fallbackStill: string | null | undefined;
  onSelectEpisode: (seasonNumber: number, episodeNumber: number, play?: boolean) => void;
  onRetrySeason: (seasonNumber: number) => void;
  /** The season heading at the top of the list changed while scrolling. */
  onVisibleSeasonChange: (seasonNumber: number) => void;
  /** Scrolled close to the end of the loaded seasons. */
  onNearEnd: () => void;
}

/** The scrolling list of a show's loaded seasons and their episodes. */
export function EpisodesSection({
  showMediaId,
  seasons,
  sections,
  loading,
  failedSeasons,
  selectedEpisode,
  progress,
  fallbackStill,
  onSelectEpisode,
  onRetrySeason,
  onVisibleSeasonChange,
  onNearEnd,
}: EpisodesSectionProps) {
  const sectionRefs = useRef(new Map<number, HTMLElement>());

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const top = event.currentTarget.getBoundingClientRect().top + 24;
      let visibleSeason: number | null = null;
      sectionRefs.current.forEach((node, seasonNumber) => {
        if (node.getBoundingClientRect().top <= top) visibleSeason = seasonNumber;
      });
      if (visibleSeason !== null) onVisibleSeasonChange(visibleSeason);
      const element = event.currentTarget;
      if (
        element.scrollTop + element.clientHeight >=
        element.scrollHeight - element.clientHeight * LOAD_NEXT_WITHIN_SCREENS
      )
        onNearEnd();
    },
    [onNearEnd, onVisibleSeasonChange]
  );

  return (
    <EpisodePane>
      <SectionLabel>Episodes</SectionLabel>
      <EpisodeList aria-label="Episodes" onScroll={handleScroll}>
        {sections.map(section => (
          <SeasonSection
            key={section.seasonNumber}
            ref={node => {
              if (node) sectionRefs.current.set(section.seasonNumber, node);
              else sectionRefs.current.delete(section.seasonNumber);
            }}
          >
            <EpisodeHeading>{section.name}</EpisodeHeading>
            {section.episodes.map(episode => {
              const selected =
                selectedEpisode?.seasonNumber === section.seasonNumber &&
                selectedEpisode.episodeNumber === episode.episodeNumber;
              const label = episodeProgressLabel(
                progressForPlayable(progress, {
                  kind: 'episode',
                  showMediaId,
                  seasonNumber: section.seasonNumber,
                  episodeNumber: episode.episodeNumber,
                })
              );
              return (
                <EpisodeRow
                  onFocus={() => onSelectEpisode(section.seasonNumber, episode.episodeNumber)}
                  id={episodeElementId(showMediaId, section.seasonNumber, episode.episodeNumber)}
                  key={episode.id}
                  type="button"
                  $selected={selected}
                  $image={artworkUrl(episode.still ?? fallbackStill, 'still', 300)}
                  onMouseEnter={() => onSelectEpisode(section.seasonNumber, episode.episodeNumber)}
                  onClick={() => onSelectEpisode(section.seasonNumber, episode.episodeNumber, true)}
                >
                  <EpisodeCaption>
                    E{episode.episodeNumber} · {episode.title}
                    {label ? <ProgressMark>{label}</ProgressMark> : null}
                  </EpisodeCaption>
                </EpisodeRow>
              );
            })}
          </SeasonSection>
        ))}
        {loading && <Spinner text="Loading more episodes..." />}
        {seasons
          .filter(item => failedSeasons.includes(item.seasonNumber))
          .map(item => (
            <ErrorState key={`error-${item.seasonNumber}`}>
              Failed to load {item.name}.
              <PrimaryAction
                type="button"
                $selected={false}
                onClick={() => onRetrySeason(item.seasonNumber)}
              >
                Retry
              </PrimaryAction>
            </ErrorState>
          ))}
      </EpisodeList>
    </EpisodePane>
  );
}

import { progressForPlayable } from '@features/progress/api/progress.api';
import type { ProgressEntry, SeasonResponse } from '@miauwatch/backend';
import {
  Badge,
  Button,
  EpisodeItem,
  Heading,
  List,
  Message,
  ProgressSpinner,
  ScrollArea,
} from '@shared/design-system';
import { useT } from '@shared/i18n';
import { artworkUrl } from '@shared/lib/media.utils';
import { FocusGroup, type MoreRequest } from '@shared/navigation';
import { realtimePlayableKey } from '@store/slices/realtime';
import { useId } from 'react';

import { episodeNavId, episodeProgress, episodeProgressLabel } from './episodes.utils';
import * as styles from './mediaDetails.css';

import NoSourceIcon from '~icons/mdi/video-off-outline';

/** Scrolling within this many screens of the end of the loaded seasons loads the next one. */
const LOAD_NEXT_WITHIN_SCREENS = 1;

/** The episodes' navigation group: one vertical column across the loaded seasons. */
export const EPISODES_GROUP = 'details-episodes';

interface EpisodesSectionProps {
  showMediaId: number;
  /** Every season, in display order (for retry labels). */
  seasons: ReadonlyArray<{ seasonNumber: number; name: string }>;
  /** Loaded seasons, in display order. */
  sections: readonly SeasonResponse[];
  loading: boolean;
  /** Seasons whose load failed and that have nothing to show. */
  failedSeasons: readonly number[];
  progress: ProgressEntry[];
  /** Shown for episodes without a still. */
  fallbackStill: string | null | undefined;
  onPlay: (seasonNumber: number, episodeNumber: number) => void;
  onRetrySeason: (seasonNumber: number) => void;
  /** A season after the last loaded one exists: Down past the last episode loads it. */
  hasMore: boolean;
  onMore: (request: MoreRequest) => void;
  /** Scrolled (wheel, touch, scrollbar) close to the end of the loaded seasons. */
  onNearEnd?: () => void;
  /** Availability pushed over realtime by playable key; newer than the season response. */
  pushedAvailability?: Readonly<Record<string, 'available' | 'pending' | 'unavailable'>>;
}

/**
 * The loaded seasons of a show and their episodes, one list per season in a scrolling pane. The
 * rows play the episode; focus moving through them is the details screen's to follow.
 */
export function EpisodesSection({
  showMediaId,
  seasons,
  sections,
  loading,
  failedSeasons,
  progress,
  fallbackStill,
  onPlay,
  onRetrySeason,
  hasMore,
  onMore,
  onNearEnd,
  pushedAvailability = {},
}: EpisodesSectionProps) {
  const t = useT();
  const headingId = useId();
  // Pointer users scroll without moving focus: near the end, the next season loads too
  const handleScroll = (viewport: HTMLDivElement) => {
    if (
      hasMore &&
      viewport.scrollTop + viewport.clientHeight >=
        viewport.scrollHeight - viewport.clientHeight * LOAD_NEXT_WITHIN_SCREENS
    )
      onNearEnd?.();
  };
  return (
    <section className={styles.episodes} aria-labelledby={headingId}>
      <Heading level={2} id={headingId}>
        {t('details.episodes')}
      </Heading>
      <div className={styles.episodeScroll}>
        <ScrollArea onScroll={onNearEnd ? handleScroll : undefined}>
          <FocusGroup id={EPISODES_GROUP} layout="vertical" more={{ end: hasMore }} onMore={onMore}>
            {sections.map(section => {
              const seasonHeadingId = `${headingId}-season-${section.seasonNumber}`;
              return (
                <div key={section.seasonNumber} className={styles.season}>
                  <div className={styles.seasonHeading}>
                    <Heading level={3} variant="heading" id={seasonHeadingId}>
                      {section.name}
                    </Heading>
                  </div>
                  <List labelledBy={seasonHeadingId}>
                    {section.episodes.map(episode => {
                      const playable = {
                        kind: 'episode' as const,
                        showMediaId,
                        seasonNumber: section.seasonNumber,
                        episodeNumber: episode.episodeNumber,
                      };
                      const entry = progressForPlayable(progress, playable);
                      const unavailable =
                        (pushedAvailability[realtimePlayableKey(playable)] ??
                          episode.sourceAvailability) === 'unavailable';
                      return (
                        <EpisodeItem
                          key={episode.id}
                          navId={episodeNavId(section.seasonNumber, episode.episodeNumber)}
                          title={t('details.episodeTitle', {
                            number: episode.episodeNumber,
                            title: episode.title,
                          })}
                          description={episode.overview ?? undefined}
                          still={artworkUrl(episode.still ?? fallbackStill, 'still', 300)}
                          progress={episodeProgress(entry)}
                          progressText={episodeProgressLabel(entry) ?? undefined}
                          badge={
                            unavailable ? (
                              <Badge icon={<NoSourceIcon />}>{t('details.noSource')}</Badge>
                            ) : undefined
                          }
                          // Still playable: the player offers to notify when a source is out
                          onClick={() => onPlay(section.seasonNumber, episode.episodeNumber)}
                        />
                      );
                    })}
                  </List>
                </div>
              );
            })}
            {seasons
              .filter(item => failedSeasons.includes(item.seasonNumber))
              .map(item => (
                <div key={`error-${item.seasonNumber}`} className={styles.listStatus}>
                  <Message
                    tone="danger"
                    toneLabel={t('common.error')}
                    actions={
                      <Button
                        navId={`season-retry:${item.seasonNumber}`}
                        onClick={() => onRetrySeason(item.seasonNumber)}
                      >
                        {t('common.retry')}
                      </Button>
                    }
                  >
                    {t('details.seasonFailed', { season: item.name })}
                  </Message>
                </div>
              ))}
          </FocusGroup>
          {loading && (
            <div className={styles.listStatus}>
              <ProgressSpinner label={t('details.loadingEpisodes')} showLabel />
            </div>
          )}
        </ScrollArea>
      </div>
    </section>
  );
}

import type { ProgressEntry, SeasonResponse } from '@miauflix/backend';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { EpisodesSection } from './EpisodesSection';

const season = (seasonNumber: number, episodes: number[]) =>
  ({
    id: seasonNumber,
    seasonNumber,
    name: `Season ${seasonNumber}`,
    overview: null,
    airDate: null,
    poster: null,
    episodes: episodes.map(episodeNumber => ({
      id: seasonNumber * 100 + episodeNumber,
      episodeNumber,
      title: `Episode title ${episodeNumber}`,
      overview: null,
      airDate: null,
      still: null,
    })),
  }) as SeasonResponse;

const progress: ProgressEntry[] = [
  {
    playable: { kind: 'episode', showMediaId: 7, seasonNumber: 1, episodeNumber: 2 },
    state: 'paused',
    positionSeconds: 300,
    durationSeconds: 1200,
    updatedAt: '2026-10-24T10:00:00Z',
  },
];

const renderSection = (overrides: Partial<Parameters<typeof EpisodesSection>[0]> = {}) => {
  const props = {
    showMediaId: 7,
    seasons: [1, 2, 3].map(number => ({ seasonNumber: number, name: `Season ${number}` })),
    sections: [season(1, [1, 2]), season(2, [1])],
    loading: false,
    failedSeasons: [] as number[],
    selectedEpisode: { seasonNumber: 1, episodeNumber: 2 },
    progress,
    fallbackStill: '/backdrop.jpg',
    onSelectEpisode: vi.fn(),
    onRetrySeason: vi.fn(),
    onVisibleSeasonChange: vi.fn(),
    onNearEnd: vi.fn(),
    ...overrides,
  };
  render(<EpisodesSection {...props} />);
  return props;
};

describe('EpisodesSection', () => {
  it('lists the loaded seasons with their episodes and progress', () => {
    renderSection();
    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual([
      'Season 1',
      'Season 2',
    ]);
    const resumed = document.getElementById('episode-7-1:2')!;
    expect(resumed).toHaveTextContent('E2 · Episode title 2');
    expect(resumed).toHaveTextContent('Resume 25%');
    expect(document.getElementById('episode-7-1:1')).not.toHaveTextContent('Resume');
  });

  it('selects an episode on focus and plays it on click', () => {
    const props = renderSection();
    const row = document.getElementById('episode-7-2:1')!;
    fireEvent.focus(row);
    expect(props.onSelectEpisode).toHaveBeenLastCalledWith(2, 1);
    fireEvent.click(row);
    expect(props.onSelectEpisode).toHaveBeenLastCalledWith(2, 1, true);
  });

  it('offers a retry for a season that failed to load', () => {
    const props = renderSection({ failedSeasons: [3] });
    expect(screen.getByText(/Failed to load Season 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetrySeason).toHaveBeenCalledWith(3);
  });

  it('shows that more episodes are loading', () => {
    renderSection({ loading: true });
    expect(screen.getByText('Loading more episodes...')).toBeInTheDocument();
  });

  it('marks episodes without any real source, preferring pushed availability', () => {
    const first = season(1, [1, 2]);
    first.episodes[0]!.sourceAvailability = 'unavailable';
    first.episodes[1]!.sourceAvailability = 'pending';
    renderSection({
      sections: [first],
      pushedAvailability: { 'e:7:1:1': 'available', 'e:7:1:2': 'unavailable' },
    });

    const rows = screen.getAllByRole('button', { name: /Episode title/ });
    expect(rows[0]).not.toHaveTextContent('No source available');
    expect(rows[1]).toHaveTextContent('No source available');
  });
});

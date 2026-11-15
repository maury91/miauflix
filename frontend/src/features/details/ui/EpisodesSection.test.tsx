import type { ProgressEntry, SeasonResponse } from '@miauflix/backend';
import { fireEvent, render, screen, within } from '@testing-library/react';
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
    progress,
    fallbackStill: '/backdrop.jpg',
    onPlay: vi.fn(),
    onRetrySeason: vi.fn(),
    hasMore: false,
    onMore: vi.fn(),
    ...overrides,
  };
  render(<EpisodesSection {...props} />);
  return props;
};

const row = (title: string) => screen.getByRole('button', { name: new RegExp(title) });

describe('EpisodesSection', () => {
  it('lists the loaded seasons with their episodes and progress', () => {
    renderSection();
    expect(screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)).toEqual([
      'Season 1',
      'Season 2',
    ]);
    const [seasonOne] = screen.getAllByRole('list');
    const rows = within(seasonOne!).getAllByRole('button');
    expect(rows[1]).toHaveAccessibleName(/E2 · Episode title 2/);
    expect(rows[1]).toHaveTextContent('Resume 25%');
    expect(rows[0]).not.toHaveTextContent('Resume');
  });

  it('plays an episode on click', () => {
    const props = renderSection({ sections: [season(2, [1])] });
    fireEvent.click(row('E1 · Episode title 1'));
    expect(props.onPlay).toHaveBeenCalledWith(2, 1);
  });

  it('offers a retry for a season that failed to load', () => {
    const props = renderSection({ failedSeasons: [3] });
    expect(screen.getByText(/Failed to load Season 3/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(props.onRetrySeason).toHaveBeenCalledWith(3);
  });

  it('shows that more episodes are loading', () => {
    renderSection({ loading: true });
    expect(screen.getByRole('status')).toHaveTextContent('Loading more episodes...');
  });

  it('marks episodes without any real source, preferring pushed availability', () => {
    const first = season(1, [1, 2]);
    first.episodes[0]!.sourceAvailability = 'unavailable';
    first.episodes[1]!.sourceAvailability = 'pending';
    renderSection({
      sections: [first],
      pushedAvailability: { 'e:7:1:1': 'available', 'e:7:1:2': 'unavailable' },
    });

    const items = screen.getAllByRole('listitem');
    expect(items[0]).not.toHaveTextContent('No source available');
    expect(items[1]).toHaveTextContent('No source available');
  });
});

import type { AudioSourceDto } from '@miauflix/backend';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AudioMenu, type AudioTrack } from './AudioMenu';

const track = (index: number, language: string | null, channels = 6): AudioTrack => ({
  index,
  language,
  title: null,
  codec: 'aac',
  channels,
  isDefault: index === 0,
});

const source = (id: number, overrides: Partial<AudioSourceDto> = {}): AudioSourceDto => ({
  id,
  quality: 'FHD' as AudioSourceDto['quality'],
  sourceType: 'WEB' as AudioSourceDto['sourceType'],
  videoCodec: 'X264' as AudioSourceDto['videoCodec'],
  size: 2 * 1024 ** 3,
  broadcasters: 10,
  releaseLanguages: [],
  audioTracks: null,
  ...overrides,
});

const tracks = [
  track(0, 'eng'),
  track(1, 'eng', 2),
  track(2, 'lit'),
  track(3, 'pol'),
  track(4, 'ita'),
  track(5, 'fre'),
];

const sources = [
  source(1, { releaseLanguages: ['en'] }),
  source(2, { releaseLanguages: ['lt'] }),
  source(3, { audioTracks: [{ language: 'lit', title: null, codec: 'aac', channels: 2 }] }),
  source(4, { releaseLanguages: ['it'] }),
];

function renderMenu(props: Partial<ComponentProps<typeof AudioMenu>> = {}) {
  const handlers = { onSearch: vi.fn(), onPlaySource: vi.fn(), onSelectTrack: vi.fn() };
  render(
    <AudioMenu
      tracks={tracks}
      selectedTrackIndex={0}
      originalLanguage="en"
      defaultLanguage="en"
      sources={sources}
      currentSourceId={1}
      {...handlers}
      {...props}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Audio' }));
  return handlers;
}

describe('AudioMenu', () => {
  it('lists the tracks as original or dubbed, the default marked, the rest behind More languages', () => {
    const { onSelectTrack } = renderMenu();
    const languages = screen.getByRole('group', { name: 'Audio language' });
    const radios = within(languages).getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(radios[0]).toHaveAccessibleName('English · Original (5.1)');
    expect(radios[0]).toBeChecked();
    expect(radios[2]).toHaveAccessibleName('Lithuanian · Dubbed (5.1)');
    expect(within(languages).getAllByText('Default')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /More languages/ }));
    expect(within(languages).getAllByRole('radio')).toHaveLength(6);

    fireEvent.click(within(languages).getByRole('radio', { name: 'English · Original (2.0)' }));
    expect(onSelectTrack).toHaveBeenCalledWith(1);
  });

  it('offers the languages with sources first and lists those in the chosen one', () => {
    const { onPlaySource, onSearch } = renderMenu();
    const picker = screen.getByRole('combobox', { name: 'Language to search' });
    // Lithuanian has two sources besides the one playing: it is suggested
    expect(picker).toHaveValue('lt');
    expect(
      within(picker).getByRole('option', { name: 'Lithuanian · 2 sources' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Audio sources \(2\)/ })).toBeInTheDocument();
    const probed = screen.getByRole('button', { name: /Lithuanian · Dubbed \(2\.0\)/ });
    expect(probed).toHaveTextContent('1080p · WEB · x264 · 2 GB');

    fireEvent.click(probed);
    expect(onPlaySource).toHaveBeenCalledWith(3, 'lt');
    expect(probed).toHaveTextContent('Switching source…');
    // Lithuanian stays chosen while the new source starts
    expect(picker).toHaveValue('lt');

    fireEvent.change(picker, { target: { value: 'it' } });
    expect(screen.getByRole('button', { name: /Audio sources \(1\)/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(onSearch).toHaveBeenCalledWith('it');
  });

  it('says when a language has no other sources yet', () => {
    renderMenu({ sources: [source(1, { releaseLanguages: ['en'] })], defaultLanguage: 'it' });
    expect(screen.getByRole('combobox', { name: 'Language to search' })).toHaveValue('it');
    expect(
      screen.getByText('No other sources in Italian yet. Search to look for some.')
    ).toBeInTheDocument();
  });

  it('keeps the search button busy while it searches', () => {
    const { onSearch } = renderMenu({ searching: true });
    const button = screen.getByRole('button', { name: 'Searching…' });
    fireEvent.click(button);
    expect(onSearch).not.toHaveBeenCalled();
  });
});

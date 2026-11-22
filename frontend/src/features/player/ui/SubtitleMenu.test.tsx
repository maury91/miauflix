import type { SubtitleCandidateDto } from '@miauflix/backend';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SubtitleMenu } from './SubtitleMenu';

const candidate = (
  id: string,
  language: string,
  provider: SubtitleCandidateDto['provider']
): SubtitleCandidateDto => ({
  id,
  language,
  provider,
  fileId: id,
  languageLabel: language.startsWith('en') ? 'English' : 'Italian',
  release: `${id} release`,
  hearingImpaired: false,
  trusted: false,
  match: 'file',
  filenameSimilarity: 100,
});

const candidates = [
  candidate('embedded-en', 'eng', 'embedded'),
  candidate('file-it', 'it', 'torrent'),
  candidate('file-en', 'en', 'torrent'),
  candidate('online-en', 'en', 'opensubtitles'),
];

function renderMenu(props: Partial<ComponentProps<typeof SubtitleMenu>> = {}) {
  const handlers = {
    onSearch: vi.fn(),
    onSelect: vi.fn(),
    onShowLanguage: vi.fn(),
    onOffsetChange: vi.fn(),
  };
  const menu = (overrides: Partial<ComponentProps<typeof SubtitleMenu>> = {}) => (
    <SubtitleMenu
      searchPreferences={{ language: 'en', hearingImpaired: false }}
      candidates={candidates}
      configured
      available
      loading={false}
      message=""
      selectedId={null}
      offset={0}
      preferencesKey={null}
      defaultLanguage="it"
      {...handlers}
      {...props}
      {...overrides}
    />
  );
  const view = render(menu());
  fireEvent.click(screen.getByRole('button', { name: 'Subtitles', exact: true }));
  return {
    ...handlers,
    rerender: (next: Partial<ComponentProps<typeof SubtitleMenu>>) => view.rerender(menu(next)),
  };
}

describe('SubtitleMenu', () => {
  it('lists the default language first, marked, and shows the chosen language', () => {
    const { onShowLanguage, onSelect } = renderMenu();
    const languages = screen.getByRole('group', { name: 'Subtitle language' });
    const names = within(languages)
      .getAllByRole('radio')
      .map(radio => radio.getAttribute('aria-labelledby'))
      .map(id => document.getElementById(id!)!.textContent);
    expect(names.slice(0, 3)).toEqual(['Off', 'Italian', 'English']);
    expect(within(languages).getByText('Default')).toBeInTheDocument();
    expect(within(languages).getByRole('radio', { name: 'Off' })).toBeChecked();

    fireEvent.click(within(languages).getByRole('radio', { name: 'English' }));
    expect(onShowLanguage).toHaveBeenCalledWith('en', false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('turns subtitles off', () => {
    const { onSelect } = renderMenu({ selectedId: 'file-en' });
    fireEvent.click(screen.getByRole('radio', { name: 'Off' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('marks the language of the track showing', () => {
    renderMenu({ selectedId: 'embedded-en' });
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
  });

  it('counts the tracks of each source and opens a view of them', () => {
    const { onSelect } = renderMenu({ selectedId: 'file-en' });
    expect(screen.getByRole('button', { name: /Embedded/ })).toHaveTextContent(
      'From the video file (1 track)'
    );
    const files = screen.getByRole('button', { name: /From files/ });
    expect(files).toHaveTextContent('In the same folder (2 tracks)');
    fireEvent.click(files);
    const tracks = screen.getByRole('group', { name: 'Subtitle tracks' });
    expect(within(tracks).getByRole('radio', { name: 'English' })).toBeChecked();
    fireEvent.click(within(tracks).getByRole('radio', { name: 'Italian' }));
    expect(onSelect).toHaveBeenCalledWith('file-it');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('group', { name: 'Subtitle language' })).toBeInTheDocument();
  });

  it('searches online in the panel language, keeping the button busy while it searches', () => {
    const { onSearch, rerender } = renderMenu();
    expect(screen.queryByRole('button', { name: /Search in/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Online/ }));
    const search = screen.getByRole('button', { name: 'Search in English' });
    fireEvent.click(search);
    expect(onSearch).toHaveBeenCalledWith('en', false);
    expect(screen.getByRole('radio', { description: 'online-en release' })).toBeInTheDocument();

    rerender({ loading: true });
    const searching = screen.getByRole('button', { name: 'Searching…' });
    // Busy, not disabled: it keeps the focus, and a second press is ignored
    expect(searching).toBe(search);
    expect(searching).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(searching);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });

  it('offers the timing only while a track shows, with its adjustment', () => {
    const { rerender } = renderMenu();
    expect(screen.getByRole('button', { name: /Synchronize subtitles/ })).toBeDisabled();
    rerender({ selectedId: 'file-en', offset: -1.5 });
    const timing = screen.getByRole('button', { name: /Synchronize subtitles/ });
    expect(timing).toHaveTextContent('-1.5s');
    fireEvent.click(timing);
    expect(screen.getByRole('slider', { name: 'Subtitle timing adjustment' })).toBeInTheDocument();
  });

  it('draws the sheet over the container it is given', () => {
    const container = document.createElement('div');
    document.body.append(container);
    renderMenu({ container });
    expect(within(container).getByRole('dialog', { name: 'Closed captions' })).toBeInTheDocument();
    container.remove();
  });
});

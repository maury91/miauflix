import type { SubtitleCandidateDto } from '@miauflix/backend';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SubtitleMenu } from './SubtitleMenu';

const candidate = (
  id: string,
  language: string,
  provider: 'torrent' | 'opensubtitles'
): SubtitleCandidateDto => ({
  id,
  language,
  provider,
  fileId: id,
  languageLabel: language === 'eng' ? 'English' : 'Italian',
  release: id,
  hearingImpaired: false,
  trusted: false,
  match: 'file',
  filenameSimilarity: 100,
});

describe('subtitle language grouping', () => {
  it('groups ISO aliases with the selected language and places torrent tracks before online results', () => {
    render(
      <SubtitleMenu
        searchPreferences={{ language: 'en', hearingImpaired: false }}
        candidates={[
          candidate('online', 'en', 'opensubtitles'),
          candidate('local', 'eng', 'torrent'),
          candidate('italian', 'ita', 'torrent'),
        ]}
        configured
        available
        loading={false}
        message=""
        selectedId={null}
        offset={0}
        onSearch={vi.fn()}
        onSelect={vi.fn()}
        onOffsetChange={vi.fn()}
        preferencesKey={null}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Subtitles', exact: true }));
    const tracks = screen.getByRole('group', { name: 'Subtitle tracks' });
    expect(tracks.textContent!.indexOf('local')).toBeLessThan(
      tracks.textContent!.indexOf('online')
    );
    expect(screen.queryByRole('button', { name: /Italian · Torrent/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Other languages (1)' }));
    expect(screen.getByRole('button', { name: /Italian · Torrent/ })).toBeVisible();
  });
});

describe('subtitle search', () => {
  it('keeps the focus on Find subtitles while it searches', () => {
    const onSearch = vi.fn();
    const menu = (loading: boolean) => (
      <SubtitleMenu
        candidates={[]}
        configured
        available
        loading={loading}
        message=""
        selectedId={null}
        offset={0}
        onSearch={onSearch}
        onSelect={vi.fn()}
        onOffsetChange={vi.fn()}
        preferencesKey={null}
      />
    );
    const { rerender } = render(menu(false));
    fireEvent.click(screen.getByRole('button', { name: 'Subtitles', exact: true }));
    const search = screen.getByRole('button', { name: 'Find subtitles' });
    search.focus();
    fireEvent.click(search);
    expect(onSearch).toHaveBeenCalledTimes(1);

    rerender(menu(true));
    const searching = screen.getByRole('button', { name: 'Searching…' });
    // A disabled button would drop the focus to the page, where the remote reaches nothing
    expect(searching).toBe(search);
    expect(searching).toBeEnabled();
    expect(searching).toHaveAttribute('aria-disabled', 'true');
    expect(searching).toHaveFocus();
    fireEvent.click(searching);
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});

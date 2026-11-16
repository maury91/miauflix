import { navigate } from '@app/router';
import { searchMiddleware } from '@features/search/search.middleware';
import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { searchActions, searchSlice, type SearchState } from '@store/slices/search';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { searchStateFixture } from './search.fixtures';
import SearchPage from './SearchPage';

vi.mock('@app/router', () => ({ navigate: vi.fn() }));

const setupTest = (search?: SearchState, { tv = false }: { tv?: boolean } = {}) => {
  const store = configureStore({
    reducer: { auth: authSlice.reducer, search: searchSlice.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(searchMiddleware),
    preloadedState: search ? { search } : undefined,
  });
  const onDismiss = vi.fn();
  render(
    <Provider store={store}>
      <SearchPage onDismiss={onDismiss} tv={tv} />
    </Provider>
  );
  return { store, onDismiss };
};

beforeEach(() => {
  // jsdom lays nothing out; the navigation layer only focuses elements on screen
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{}] as unknown as DOMRectList
  );
  // jsdom has no scrolling
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

/** A key on whatever holds focus, as the remote sends it. */
const press = (key: string, init: Partial<KeyboardEventInit> = {}) =>
  act(() => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key, ...init });
  });

describe('SearchPage', () => {
  it('types with the on-screen keyboard on TV, where the field only shows the text', () => {
    const { store } = setupTest(undefined, { tv: true });
    expect(screen.getByRole('button', { name: 'a' })).toHaveFocus();

    press('Enter');
    press('ArrowRight');
    press('Enter');
    const field = screen.getByRole('searchbox', { name: 'Search' });
    expect(field).toHaveValue('ab');
    expect(field).toHaveAttribute('readonly');
    // No submit arrow: the search runs as the keyboard types
    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(store.getState().search.query).toBe('a');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(store.getState().search.query).toBe('');

    // The field is not a focus stop: Up from the top row stays on the keyboard
    press('ArrowLeft');
    press('ArrowUp');
    expect(screen.getByRole('button', { name: 'a' })).toHaveFocus();
  });

  it('moves left from the keyboard to the rail back button, which leaves the page', () => {
    const { onDismiss } = setupTest(undefined, { tv: true });
    press('ArrowLeft');
    expect(screen.getByRole('button', { name: 'Back to Home' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();

    press('Enter');
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('starts on the search field without a keyboard off TV, and Down goes to the results', () => {
    setupTest(searchStateFixture);
    expect(screen.queryByRole('group', { name: 'On-screen keyboard' })).not.toBeInTheDocument();
    // Ready to type
    const field = screen.getByRole('searchbox', { name: 'Search' });
    expect(field).toHaveFocus();
    act(() => {
      fireEvent.keyDown(field, { key: 'ArrowDown' });
    });
    expect(document.activeElement).toHaveAccessibleName(searchStateFixture.results[0]!.title);
  });

  it('moves focus to the results when Enter submits the search box', async () => {
    const { store } = setupTest(searchStateFixture);
    // The field starts in edit mode off TV
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveFocus();
    press('Enter');
    expect(store.getState().search.status).toBe('loading');

    const { requestId } = store.getState().search;
    act(() => {
      store.dispatch(
        searchActions.serverMessage({
          type: 'search-results',
          requestId,
          page: 1,
          totalPages: 1,
          totalResults: 1,
          results: searchStateFixture.results.slice(0, 1),
        })
      );
    });
    const results = screen.getByRole('region', { name: 'Results for “Dune”' });
    expect(results).toContainElement(document.activeElement as HTMLElement);
    expect(document.activeElement).toHaveAccessibleName(searchStateFixture.results[0]!.title);
  });

  const submit = (store: ReturnType<typeof setupTest>['store']) => {
    // The field starts in edit mode: Enter submits
    press('Enter');
    return store.getState().search.requestId;
  };

  it('explains a search that needs setup, retries it and shows the technical details', () => {
    const { store } = setupTest({ ...searchStateFixture, results: [], status: 'idle' });
    const requestId = submit(store);
    act(() => {
      store.dispatch(
        searchActions.serverMessage({
          type: 'search-error',
          requestId,
          message: 'search-failed',
          error: {
            success: false,
            status: 503,
            code: 'service_not_configured',
            error: 'Media Catalog is not configured.',
            message: 'Media Catalog is not configured.',
            errorId: 'abcd1234',
            needsConfiguration: true,
            hint: 'An admin needs to configure TMDB.',
          },
        })
      );
    });

    expect(screen.getByRole('heading', { name: 'Search needs to be set up' })).toBeInTheDocument();
    expect(screen.getByText('Media Catalog is not configured.')).toBeInTheDocument();
    expect(screen.getByText('An admin needs to configure TMDB.')).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toHaveFocus();

    press('ArrowDown');
    const toggle = screen.getByRole('button', { name: 'Technical details' });
    expect(toggle).toHaveFocus();
    expect(screen.queryByText('abcd1234')).not.toBeInTheDocument();
    press('Enter');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('abcd1234')).toBeInTheDocument();

    press('ArrowUp');
    expect(retry).toHaveFocus();
    press('Enter');
    expect(store.getState().search.status).toBe('loading');
    const retryId = store.getState().search.requestId;
    expect(retryId).toBeGreaterThan(requestId);

    // When the retry works, focus moves to its results.
    act(() => {
      store.dispatch(
        searchActions.serverMessage({
          type: 'search-results',
          requestId: retryId,
          page: 1,
          totalPages: 1,
          totalResults: searchStateFixture.results.length,
          results: searchStateFixture.results,
        })
      );
    });
    expect(document.activeElement).toHaveAccessibleName(searchStateFixture.results[0]!.title);
  });

  it('offers to clear a search without results', () => {
    const { store } = setupTest({ ...searchStateFixture, results: [], status: 'idle' });
    store.dispatch(searchActions.queryChanged('zzzz'));
    const requestId = submit(store);
    act(() => {
      store.dispatch(
        searchActions.serverMessage({
          type: 'search-results',
          requestId,
          page: 1,
          totalPages: 0,
          totalResults: 0,
          results: [],
        })
      );
    });

    expect(screen.getByRole('heading', { name: 'No results for ‘zzzz’' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toHaveFocus();
    press('Enter');
    expect(store.getState().search.query).toBe('');
    // Back in the field, ready to type again
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveFocus();
  });

  it('ignores the Enter that confirms an IME composition', () => {
    const { store } = setupTest(searchStateFixture);
    const box = screen.getByRole('searchbox', { name: 'Search' });
    press('Enter', { isComposing: true });
    expect(store.getState().search.status).toBe('ready');
    expect(box).toHaveFocus();

    press('Enter');
    expect(store.getState().search.status).toBe('loading');
  });

  it('shows the catalog genres as chips and browses one', () => {
    const { store } = setupTest(searchStateFixture);
    expect(
      within(screen.getByRole('region', { name: 'Popular searches' })).getAllByRole('button')
    ).toHaveLength(searchStateFixture.genres.length);

    fireEvent.click(screen.getByRole('button', { name: 'Horror' }));
    expect(store.getState().search).toMatchObject({ genre: '27', query: 'Horror' });
    expect(screen.getByRole('heading', { name: 'Popular in “Horror”' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Anime' }));
    expect(store.getState().search).toMatchObject({ genre: 'anime', query: 'Anime' });
  });

  it('shows no genre chips until the backend sends them', () => {
    setupTest();
    expect(screen.queryByRole('region', { name: 'Popular searches' })).not.toBeInTheDocument();
  });

  it('shows results with their metadata and opens details with search as the parent', () => {
    const { store } = setupTest(searchStateFixture);
    expect(screen.getByRole('heading', { name: 'Results for “Dune”' })).toBeInTheDocument();
    expect(screen.getByText('24 results')).toBeInTheDocument();
    expect(screen.getByText(/· 2h 35m ·/)).toBeInTheDocument();
    expect(screen.getAllByText(/^S1 · /)).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Dune: Prophecy' }));

    expect(navigate).toHaveBeenCalledWith(
      { type: 'showDetails', mediaId: 1368166 },
      { parent: { type: 'search' } }
    );
    expect(store.getState().search.focus).toBe('search-result:tvshow:1368166');
  });

  it('starts on the result it opened when it comes back from details', () => {
    setupTest({ ...searchStateFixture, focus: 'search-result:tvshow:1368166' });
    expect(screen.getByRole('button', { name: 'Dune: Prophecy' })).toHaveFocus();
  });

  it('forgets a recent search from its remove action', () => {
    const { store } = setupTest(searchStateFixture);
    fireEvent.click(screen.getByRole('button', { name: 'Remove “Silo”' }));
    expect(store.getState().search.recents.map(recent => recent.label)).not.toContain('Silo');
  });

  it('runs a recent search and leaves on Back', () => {
    const { store, onDismiss } = setupTest(searchStateFixture, { tv: true });
    fireEvent.click(screen.getByRole('button', { name: 'Silo' }));
    expect(store.getState().search.query).toBe('Silo');
    press('Escape');
    expect(onDismiss).toHaveBeenCalled();
    expect(store.getState().search.focus).toBeNull();
  });

  it('forgets the result it would start on when Back leaves', () => {
    const { store, onDismiss } = setupTest(
      { ...searchStateFixture, focus: 'search-result:tvshow:1368166' },
      { tv: true }
    );
    expect(screen.getByRole('button', { name: 'Dune: Prophecy' })).toHaveFocus();

    press('Escape');
    expect(onDismiss).toHaveBeenCalled();
    expect(store.getState().search.focus).toBeNull();
  });

  it('ends a browsed genre with Clear, though it shows no text to clear', () => {
    const { store } = setupTest(searchStateFixture, { tv: true });
    fireEvent.click(screen.getByRole('button', { name: 'Horror' }));
    expect(store.getState().search.genre).toBe('27');

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(store.getState().search).toMatchObject({ genre: null, query: '' });
  });

  it('keeps the focused side-column item in view by the least scroll', () => {
    setupTest(searchStateFixture, { tv: true });
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView);
    const keyboard = screen.getByRole('group', { name: 'On-screen keyboard' });
    const popular = screen.getByRole('region', { name: 'Popular searches' });
    const inside = (container: HTMLElement) => container.contains(document.activeElement);

    // Down through the keyboard to the popular searches below it
    for (let step = 0; step < 10 && !inside(popular); step++) press('ArrowDown');
    expect(inside(popular)).toBe(true);
    const chip = document.activeElement;
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(chip);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });

    // And back up to the keyboard, which scrolls back into view
    press('ArrowUp');
    expect(inside(keyboard)).toBe(true);
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(document.activeElement);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest' });
  });

  it('replaces a browsed genre with what the keyboard types', () => {
    const { store } = setupTest(searchStateFixture, { tv: true });
    fireEvent.click(screen.getByRole('button', { name: 'Horror' }));
    fireEvent.click(screen.getByRole('button', { name: 'd' }));
    expect(store.getState().search).toMatchObject({ genre: null, query: 'd' });
  });
});

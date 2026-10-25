import { navigate } from '@app/router';
import { searchMiddleware } from '@features/search/search.middleware';
import { configureStore } from '@reduxjs/toolkit';
import { authSlice } from '@store/slices/auth';
import { searchActions, searchSlice, type SearchState } from '@store/slices/search';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { searchStateFixture } from './search.fixtures';
import SearchPage from './SearchPage';

vi.mock('@app/router', () => ({ navigate: vi.fn() }));

const setupTest = (search?: SearchState) => {
  const store = configureStore({
    reducer: { auth: authSlice.reducer, search: searchSlice.reducer },
    middleware: getDefaultMiddleware => getDefaultMiddleware().concat(searchMiddleware),
    preloadedState: search ? { search } : undefined,
  });
  const onDismiss = vi.fn();
  render(
    <Provider store={store}>
      <SearchPage onDismiss={onDismiss} />
    </Provider>
  );
  return { store, onDismiss };
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SearchPage', () => {
  it('types with the on-screen keyboard and moves up to the search box', () => {
    const { store } = setupTest();
    const keyA = screen.getByRole('button', { name: 'A' });
    expect(document.activeElement).toBe(keyA);

    fireEvent.keyDown(keyA, { key: 'Enter' });
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('ab');

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(store.getState().search.query).toBe('a');

    // Delete sits on the action row, six rows below the top of the grid.
    for (let step = 0; step < 7; step++)
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search' }));
  });

  it('moves left from the keyboard to the rail back button, which leaves the page', () => {
    const { onDismiss } = setupTest();
    fireEvent.keyDown(screen.getByRole('button', { name: 'A' }), { key: 'ArrowLeft' });
    const back = screen.getByRole('button', { name: 'Back to Home' });
    expect(document.activeElement).toBe(back);
    expect(screen.queryByRole('button', { name: 'Home' })).not.toBeInTheDocument();

    fireEvent.keyDown(back, { key: 'Enter' });
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('moves focus to the results when Enter submits the search box', async () => {
    const { store } = setupTest(searchStateFixture);
    const box = screen.getByRole('searchbox', { name: 'Search' });
    box.focus();
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(store.getState().search.focus.zone).toBe('input');

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
    expect(store.getState().search.focus).toEqual({ zone: 'results', index: 0 });
    const results = screen.getByRole('region', { name: 'Results for “Dune”' });
    expect(results).toContainElement(document.activeElement as HTMLElement);
  });

  it('ignores the Enter that confirms an IME composition', () => {
    const { store } = setupTest(searchStateFixture);
    const box = screen.getByRole('searchbox', { name: 'Search' });
    box.focus();
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true });
    expect(store.getState().search.status).toBe('ready');
    expect(box).toHaveFocus();

    fireEvent.keyDown(box, { key: 'Enter' });
    expect(store.getState().search.status).toBe('loading');
  });

  it('shows the catalog genres as chips and browses one', () => {
    const { store } = setupTest(searchStateFixture);
    expect(
      screen
        .getAllByRole('button')
        .filter(button => button.closest('[aria-label="Popular searches"]'))
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
    expect(screen.getByText('2h 35m')).toBeInTheDocument();
    expect(screen.getAllByText('S1')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Dune: Prophecy' }));

    expect(navigate).toHaveBeenCalledWith(
      { type: 'showDetails', mediaId: 1368166 },
      { parent: { type: 'search' } }
    );
    expect(store.getState().search.focus).toEqual({ zone: 'results', index: 2 });
  });

  it('runs a recent search and leaves on Back', () => {
    const { store, onDismiss } = setupTest(searchStateFixture);
    fireEvent.click(screen.getByRole('button', { name: 'Silo' }));
    expect(store.getState().search.query).toBe('Silo');

    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalled();
  });
});

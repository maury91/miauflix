import { navigate } from '@app/router';
import { IS_TV } from '@shared/config/constants';
import {
  alphanumericKeys,
  NavItem,
  NavRail,
  SearchField,
  SearchKeyboard,
  SurfaceContextProvider,
} from '@shared/design-system';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import {
  FocusGroup,
  FocusScope,
  NavigationProvider,
  useActiveIdWithin,
  useNavigation,
} from '@shared/navigation';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { searchActions, searchResultKey } from '@store/slices/search';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

import { PopularSearches, RecentSearches } from './components/SearchChips';
import { searchPanelKind } from './components/searchPanel';
import { SearchResults } from './components/SearchResults';
import { SEARCH_NAV, SEARCH_START } from './searchNav';
import * as styles from './searchPage.css';

import ArrowLeftIcon from '~icons/mdi/arrow-left';
import DeleteIcon from '~icons/mdi/backspace-outline';
import ClearIcon from '~icons/mdi/close';
import SpaceIcon from '~icons/mdi/keyboard-space';

/** Load the next page once focus is this close to the end of the results. */
const NEXT_PAGE_THRESHOLD = 3;
export const MAX_RECENT_CHIPS = 5;

const KEYS = alphanumericKeys({
  space: { label: 'Space', icon: <SpaceIcon /> },
  delete: { label: 'Delete', icon: <DeleteIcon /> },
  clear: { label: 'Clear', icon: <ClearIcon /> },
});

interface SearchPageProps {
  onDismiss: () => void;
}

/**
 * TV search on the design system (docs/plans/style-guide.md, sections 9 and 10): the back rail,
 * then the search field above the on-screen keyboard and, beside it, popular and recent searches
 * and the results row. One navigation scope; it starts where it was left (a result opened from
 * here), else on the keyboard.
 */
export default function SearchPage(props: SearchPageProps) {
  return (
    <NavigationProvider>
      <SearchScreen {...props} />
    </NavigationProvider>
  );
}

function SearchScreen({ onDismiss }: SearchPageProps) {
  const dispatch = useAppDispatch();
  const search = useAppSelector(state => state.search);
  const { focus } = useNavigation();
  // Read once: where focus starts
  const [initialId] = useState(() => search.focus ?? SEARCH_START);

  const genres = search.genres;
  const genreChips = useMemo(
    () => genres.map(genre => ({ key: genre.key, label: genre.name })),
    [genres]
  );
  const recents = useMemo(
    () =>
      search.recents.slice(0, MAX_RECENT_CHIPS).map(recent => ({
        key: `${recent.kind}:${recent.query}`,
        label: recent.label,
        recent,
      })),
    [search.recents]
  );

  useEffect(() => {
    dispatch(searchActions.recentsRequested());
    dispatch(searchActions.genresRequested());
  }, [dispatch]);

  // Ask for more results as focus nears the end of the row.
  const activeResult = useActiveIdWithin(SEARCH_NAV.results);
  useEffect(() => {
    if (activeResult === null) return;
    const index = search.results.findIndex(
      result => SEARCH_NAV.result(searchResultKey(result)) === activeResult
    );
    if (index >= search.results.length - NEXT_PAGE_THRESHOLD)
      dispatch(searchActions.nextPageRequested());
  }, [activeResult, dispatch, search.results]);

  const text = search.genre ? '' : search.query;
  const setQuery = (value: string) => dispatch(searchActions.queryChanged(value));
  const typeText = (typed: string) => setQuery(text + typed);
  const deleteCharacter = () => setQuery(Array.from(text).slice(0, -1).join(''));

  // Enter in the search field moves to the results once the submitted search answers.
  const focusResultsWhenReady = useRef(false);
  const submit = () => {
    if (!search.genre && !search.query.trim()) return;
    focusResultsWhenReady.current = true;
    dispatch(searchActions.submitted());
  };
  const panel = searchPanelKind(search.status, search.results.length);
  useEffect(() => {
    if (!focusResultsWhenReady.current || search.status === 'loading') return;
    focusResultsWhenReady.current = false;
    const first = search.results[0];
    if (search.status === 'ready' && first) focus(SEARCH_NAV.result(searchResultKey(first)));
    // No results or a failure: focus what to do next (clear, or try again).
    else if (panel) focus(SEARCH_NAV.panelAction);
  }, [focus, panel, search.results, search.status]);

  const retrySearch = () => {
    // The panel goes away while it runs; focus the results, or Try again, once it is done.
    focusResultsWhenReady.current = true;
    dispatch(searchActions.retryRequested());
  };
  const clearSearch = () => {
    setQuery('');
    focus(SEARCH_START);
  };
  const leave = () => {
    dispatch(searchActions.focusChanged(null));
    onDismiss();
  };

  const openResult = (index: number) => {
    const result = search.results[index];
    if (!result) return;
    // Back from details starts on this result
    dispatch(searchActions.focusChanged(SEARCH_NAV.result(searchResultKey(result))));
    dispatch(searchActions.resultOpened(result));
    navigate(
      result._type === 'movie'
        ? { type: 'movieDetails', mediaId: result.mediaId }
        : { type: 'showDetails', mediaId: result.mediaId },
      { parent: { type: 'search' } }
    );
  };
  const selectGenre = (index: number) => {
    const genre = genres[index];
    if (genre) dispatch(searchActions.genreSelected(genre));
  };
  const selectRecent = (index: number) => {
    const entry = recents[index];
    if (entry) dispatch(searchActions.recentSelected(entry.recent));
  };
  const removeRecent = (index: number) => {
    const entry = recents[index];
    if (entry) dispatch(searchActions.recentRemoved(entry.recent));
  };

  // Keys the layer doesn't own: Back edits the query or leaves
  const keysRef = useKeyboardNavigation({
    onBack: event => {
      // A physical Backspace edits the query; remote Back leaves the page.
      if (event.key === 'Backspace' && (search.query || search.genre)) {
        deleteCharacter();
        return true;
      }
      leave();
      return true;
    },
  });

  // On desktop, typing anywhere on the page goes to the search field.
  const typeIntoField = (event: KeyboardEvent<HTMLElement>) => {
    if (IS_TV || event.defaultPrevented || event.target instanceof HTMLInputElement) return;
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    typeText(event.key);
    focus(SEARCH_NAV.field, { part: 'input' });
  };

  const heading = search.genre
    ? `Popular in “${search.query}”`
    : `Results for “${search.query.trim()}”`;
  const showResults = search.status !== 'idle' || search.results.length > 0;

  return (
    <main ref={keysRef} className={styles.page} aria-label="Search" onKeyDown={typeIntoField}>
      <FocusScope id={SEARCH_NAV.scope} layout="horizontal" initialId={initialId}>
        <div className={styles.rail}>
          <NavRail label="Search" navId={SEARCH_NAV.rail}>
            <NavItem
              navId={SEARCH_NAV.back}
              icon={<ArrowLeftIcon />}
              label="Back to Home"
              onClick={leave}
            />
          </NavRail>
        </div>
        <SurfaceContextProvider value="solid">
          <FocusGroup id={SEARCH_NAV.content} layout="vertical">
            <div className={styles.body}>
              <div className={styles.field}>
                <SearchField
                  navId={SEARCH_NAV.field}
                  size="lg"
                  label="Search"
                  value={search.query}
                  // The remote types with the on-screen keyboard, not the system IME
                  readOnly={IS_TV}
                  maxLength={100}
                  placeholder="Search for movies, TV shows, anime..."
                  autoComplete="off"
                  spellCheck={false}
                  onChange={event => setQuery(event.target.value)}
                  onSearch={submit}
                  submitLabel="Search"
                />
              </div>
              <FocusGroup id={SEARCH_NAV.columns} layout="horizontal">
                <div className={styles.columns}>
                  <div className={styles.keyboard}>
                    <SearchKeyboard
                      label="On-screen keyboard"
                      keys={KEYS}
                      value={text}
                      onChange={setQuery}
                      navId={SEARCH_NAV.keyboard}
                    />
                  </div>
                  <FocusGroup id={SEARCH_NAV.side} layout="vertical">
                    <div className={styles.side}>
                      {genreChips.length > 0 && (
                        <PopularSearches
                          genres={genreChips}
                          selected={search.genre}
                          onSelect={selectGenre}
                        />
                      )}
                      {recents.length > 0 && (
                        <RecentSearches
                          recents={recents}
                          onSelect={selectRecent}
                          onRemove={removeRecent}
                        />
                      )}
                      {showResults && (
                        <SearchResults
                          heading={heading}
                          status={search.status}
                          error={search.error}
                          results={search.results}
                          details={search.details}
                          totalResults={search.totalResults}
                          hasMore={search.page < search.totalPages}
                          onLoadMore={() => dispatch(searchActions.nextPageRequested())}
                          onOpen={openResult}
                          query={search.query}
                          isGenre={search.genre !== null}
                          onRetry={retrySearch}
                          onClear={clearSearch}
                        />
                      )}
                    </div>
                  </FocusGroup>
                </div>
              </FocusGroup>
            </div>
          </FocusGroup>
        </SurfaceContextProvider>
      </FocusScope>
    </main>
  );
}

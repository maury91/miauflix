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
import { type Translate, useT } from '@shared/i18n';
import {
  FocusGroup,
  FocusScope,
  NavigationProvider,
  useActiveIdWithin,
  useNavigation,
} from '@shared/navigation';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { searchActions, searchResultKey } from '@store/slices/search';
import { type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { PopularSearches, RecentSearches } from './components/SearchChips';
import { searchPanelKind } from './components/searchPanel';
import { SearchResults } from './components/SearchResults';
import { SEARCH_NAV, SEARCH_START } from './searchNav';
import * as styles from './searchPage.css';

import ArrowLeftIcon from '~icons/mdi/arrow-left';
import DeleteIcon from '~icons/mdi/backspace-outline';
import SpaceIcon from '~icons/mdi/keyboard-space';

/** Load the next page once focus is this close to the end of the results. */
const NEXT_PAGE_THRESHOLD = 3;
export const MAX_RECENT_CHIPS = 5;

const searchKeys = (t: Translate) =>
  alphanumericKeys({
    space: { label: t('search.key.space'), icon: <SpaceIcon /> },
    delete: { label: t('search.key.delete'), icon: <DeleteIcon /> },
    // Spelled out: a bare cross reads as "close"
    clear: { label: t('search.key.clear') },
  });

interface SearchPageProps {
  onDismiss: () => void;
  /**
   * TV: the on-screen keyboard types and the field only shows the text. Elsewhere there is no
   * keyboard and the field is focused and typed into. Defaults to the platform.
   */
  tv?: boolean;
}

/**
 * Search on the design system (docs/plans/style-guide.md, sections 9 and 10): the back rail, then
 * a column with the on-screen keyboard (TV only) over popular and recent searches and, beside it,
 * the search field over the results mosaic. One navigation scope; it starts where it was left (a
 * result opened from here), else on the keyboard (TV) or the field.
 */
export default function SearchPage(props: SearchPageProps) {
  return (
    <NavigationProvider>
      <SearchScreen {...props} />
    </NavigationProvider>
  );
}

function SearchScreen({ onDismiss, tv = IS_TV }: SearchPageProps) {
  const t = useT();
  const keys = useMemo(() => searchKeys(t), [t]);
  const dispatch = useAppDispatch();
  const search = useAppSelector(state => state.search);
  const { focus, lastInput } = useNavigation();
  const start = tv ? SEARCH_START : SEARCH_NAV.field;
  const fieldRef = useRef<HTMLInputElement>(null);
  // Read once: where focus starts
  const [initialId] = useState(() => search.focus ?? start);
  // The app logo lines up with the left column, as it does with Home's rows
  const sideRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const align = () => {
      const left = sideRef.current?.getBoundingClientRect().left;
      if (left) document.body.style.setProperty('--home-content-left', `${left}px`);
    };
    align();
    window.addEventListener('resize', align);
    return () => {
      window.removeEventListener('resize', align);
      document.body.style.removeProperty('--home-content-left');
    };
  }, []);

  // The layer focuses without scrolling: keep the focused key or chip in view in the side column,
  // by the least scroll. Pointer focus never scrolls: the pointer is already on it
  const activeSide = useActiveIdWithin(SEARCH_NAV.side);
  useEffect(() => {
    if (activeSide === null || lastInput() === 'pointer') return;
    sideRef.current
      ?.querySelector<HTMLElement>('[data-focused]')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeSide, lastInput]);

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
  const submitAction:
    | { onSearch: () => void; submitLabel: string }
    | { onSearch?: undefined; submitLabel?: undefined } = tv
    ? {}
    : { onSearch: submit, submitLabel: t('search.search') };
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
    focus(start);
    if (!tv) fieldRef.current?.focus();
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

  // On desktop, typing anywhere on the page goes on in the search field.
  const typeIntoField = (event: KeyboardEvent<HTMLElement>) => {
    if (tv || event.defaultPrevented || event.target instanceof HTMLInputElement) return;
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    typeText(event.key);
    fieldRef.current?.focus();
  };
  // Off TV the field starts ready to type, unless focus comes back to a result
  const mainRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!tv && initialId === SEARCH_NAV.field) fieldRef.current?.focus();
  }, [initialId, tv]);
  // A text field holds no DOM focus outside edit mode: keep it on the page so its keys (typing,
  // Back) still reach it after editing ends
  const keepFocusInPage = () => {
    queueMicrotask(() => {
      const active = document.activeElement;
      if (!active || active === document.body) mainRef.current?.focus({ preventScroll: true });
    });
  };
  const pageRef = (element: HTMLElement | null) => {
    mainRef.current = element;
    keysRef(element);
  };

  // Down from the field being typed in goes on to the results, as a desktop search box does
  const leaveFieldDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'ArrowDown' || event.nativeEvent.isComposing) return;
    if (focus(SEARCH_NAV.results) || focus(SEARCH_NAV.panel)) event.preventDefault();
  };

  const heading = search.genre
    ? t('search.popularIn', { genre: search.query })
    : t('search.resultsFor', { query: search.query.trim() });
  const showResults = search.status !== 'idle' || search.results.length > 0;

  return (
    <main
      ref={pageRef}
      className={styles.page}
      aria-label={t('search.search')}
      // Programmatic focus only (see keepFocusInPage), never a Tab stop
      tabIndex={-1}
      onKeyDown={typeIntoField}
      onBlur={keepFocusInPage}
    >
      <FocusScope id={SEARCH_NAV.scope} layout="horizontal" initialId={initialId}>
        <div className={styles.rail}>
          <NavRail label={t('search.search')} navId={SEARCH_NAV.rail}>
            <NavItem
              navId={SEARCH_NAV.back}
              icon={<ArrowLeftIcon />}
              label={t('common.backToHome')}
              onClick={leave}
            />
          </NavRail>
        </div>
        <SurfaceContextProvider value="solid">
          <FocusGroup id={SEARCH_NAV.content} layout="horizontal">
            <div className={styles.body}>
              <FocusGroup id={SEARCH_NAV.side} layout="vertical">
                <div ref={sideRef} className={styles.side}>
                  {tv && (
                    <div className={styles.keyboard}>
                      <SearchKeyboard
                        label={t('search.keyboard')}
                        keys={keys}
                        value={text}
                        onChange={setQuery}
                        // The browsed genre shows no text, so Clear has nothing to change: it
                        // still ends the genre. Typing replaces it through onChange.
                        onPress={key => {
                          if (key.kind === 'clear' && search.genre) setQuery('');
                        }}
                        navId={SEARCH_NAV.keyboard}
                      />
                    </div>
                  )}
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
                </div>
              </FocusGroup>
              <FocusGroup id={SEARCH_NAV.main} layout="vertical">
                <div className={styles.main}>
                  <div className={styles.field}>
                    <SearchField
                      ref={fieldRef}
                      // On TV the keyboard types and the search runs as it does: the field only
                      // shows the text, so it is not a focus stop and has no submit arrow
                      navId={tv ? undefined : SEARCH_NAV.field}
                      size="lg"
                      label={t('search.search')}
                      labelHidden
                      value={search.query}
                      // The remote types with the on-screen keyboard, not the system IME
                      readOnly={tv}
                      tabIndex={tv ? -1 : undefined}
                      maxLength={100}
                      placeholder={t('search.placeholder')}
                      autoComplete="off"
                      spellCheck={false}
                      onChange={event => setQuery(event.target.value)}
                      onKeyDown={leaveFieldDown}
                      {...submitAction}
                    />
                  </div>
                  {showResults && (
                    <SearchResults
                      heading={heading}
                      status={search.status}
                      error={search.error}
                      results={search.results}
                      details={search.details}
                      totalResults={search.totalResults}
                      hasMore={search.page < search.totalPages}
                      onLoadMore={() => {
                        dispatch(searchActions.nextPageRequested());
                      }}
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
        </SurfaceContextProvider>
      </FocusScope>
    </main>
  );
}

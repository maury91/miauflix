import { navigate } from '@app/router';
import { SEARCH_GENRE_CHIPS, searchGenreLabel } from '@features/search/search-genres';
import { IS_TV, PALETTE } from '@shared/config/constants';
import { useKeyboardNavigation } from '@shared/hooks/useKeyboardNavigation';
import { BackRail } from '@shared/ui/rail/BackRail';
import { useRailContentLeft } from '@shared/ui/rail/useRailContentLeft';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { searchActions, type SearchFocus } from '@store/slices/search';
import { type FC, type KeyboardEvent, useCallback, useEffect, useMemo, useRef } from 'react';
import styled from 'styled-components';

import { OnScreenKeyboard } from './components/OnScreenKeyboard';
import { SearchBox } from './components/SearchBox';
import { SearchChips } from './components/SearchChips';
import { SearchResults } from './components/SearchResults';
import {
  clampSearchFocus,
  isCharacterKey,
  KEYBOARD_BACKSPACE,
  KEYBOARD_CHARACTERS,
  KEYBOARD_SPACE,
  MAX_RECENT_CHIPS,
  moveSearchFocus,
  POPULAR_COLUMNS,
  type SearchDirection,
} from './searchNavigation';

import ClockIcon from '~icons/mdi/clock-outline';
import SearchIcon from '~icons/mdi/magnify';

/** Load the next page once focus is this close to the end of the results. */
const NEXT_PAGE_THRESHOLD = 3;

const Page = styled.main`
  position: fixed;
  inset: 0;
  z-index: 1000;
  overflow: hidden;
  padding: 10.5vh 3.2vw 0 calc(max(5vw, 56px) + 2.4vw);
  background:
    radial-gradient(ellipse at 85% 0%, rgba(80, 90, 110, 0.18), transparent 55%),
    linear-gradient(180deg, #121419 0%, #08090c 100%);
  color: ${PALETTE.text.primary};
  font-family: 'Poppins', sans-serif;
`;

const Columns = styled.div`
  display: grid;
  grid-template-columns: 24vw minmax(0, 1fr);
  gap: 3.2vw;
  /* Keep the keyboard's rows fixed when results make the right column taller. */
  align-items: start;
  margin-top: 6vh;
`;

const RightColumn = styled.div`
  min-width: 0;
  margin-top: -1.6vh;
`;

interface SearchPageProps {
  onDismiss: () => void;
}

/** TV search: query box, on-screen keyboard, genre and recent shortcuts, and the results row. */
const SearchPage: FC<SearchPageProps> = ({ onDismiss }) => {
  const dispatch = useAppDispatch();
  const search = useAppSelector(state => state.search);
  const inputRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  const elements = useRef(new Map<string, HTMLElement>());

  const recents = useMemo(
    () =>
      search.recents.slice(0, MAX_RECENT_CHIPS).map(recent => ({
        key: `${recent.kind}:${recent.query}`,
        label: recent.kind === 'genre' ? searchGenreLabel(recent.query) : recent.query,
        recent,
      })),
    [search.recents]
  );
  const counts = useMemo(
    () => ({
      popular: SEARCH_GENRE_CHIPS.length,
      recents: recents.length,
      results: search.results.length,
    }),
    [recents.length, search.results.length]
  );
  const focus = search.focus;

  const setFocus = useCallback(
    (next: SearchFocus) => {
      dispatch(searchActions.focusChanged(next));
      if (next.zone === 'keyboard' && isCharacterKey(next.index))
        dispatch(searchActions.keyRemembered(next.index));
    },
    [dispatch]
  );
  // Enter in the search box moves to the results once the submitted search answers.
  const focusResultsWhenReady = useRef(false);
  const register = useCallback(
    (zone: string) => (index: number, element: HTMLElement | null) => {
      if (element) elements.current.set(`${zone}:${index}`, element);
      else elements.current.delete(`${zone}:${index}`);
    },
    []
  );

  useEffect(() => {
    dispatch(searchActions.recentsRequested());
  }, [dispatch]);

  useRailContentLeft();

  // Results and recents change under the remembered focus; keep it on something that exists.
  useEffect(() => {
    const clamped = clampSearchFocus(focus, counts);
    if (clamped.zone !== focus.zone || clamped.index !== focus.index) setFocus(clamped);
  }, [counts, focus, setFocus]);

  // Move DOM focus to the focused control.
  useEffect(() => {
    const element =
      focus.zone === 'input'
        ? inputRef.current
        : focus.zone === 'back'
          ? backRef.current
          : elements.current.get(`${focus.zone}:${focus.index}`);
    if (element && document.activeElement !== element) {
      element.focus({ preventScroll: true });
    }
    if (focus.zone === 'results')
      element?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [focus, search.results.length]);

  // Ask for more results as focus nears the end of the row.
  useEffect(() => {
    if (focus.zone === 'results' && focus.index >= search.results.length - NEXT_PAGE_THRESHOLD)
      dispatch(searchActions.nextPageRequested());
  }, [dispatch, focus, search.results.length]);

  const typeText = useCallback(
    (text: string) =>
      dispatch(searchActions.queryChanged((search.genre ? '' : search.query) + text)),
    [dispatch, search.genre, search.query]
  );
  const deleteCharacter = useCallback(
    () => dispatch(searchActions.queryChanged(search.genre ? '' : search.query.slice(0, -1))),
    [dispatch, search.genre, search.query]
  );

  const pressKey = (index: number) => {
    setFocus({ zone: 'keyboard', index });
    if (index < KEYBOARD_BACKSPACE) typeText(KEYBOARD_CHARACTERS[index]!.toLowerCase());
    else if (index === KEYBOARD_BACKSPACE) deleteCharacter();
    else if (index === KEYBOARD_SPACE) typeText(' ');
  };
  const submitFromBox = () => {
    if (!search.genre && !search.query.trim()) return;
    focusResultsWhenReady.current = true;
    dispatch(searchActions.submitted());
  };

  useEffect(() => {
    if (!focusResultsWhenReady.current || search.status === 'loading') return;
    focusResultsWhenReady.current = false;
    if (search.status === 'ready' && search.results.length) setFocus({ zone: 'results', index: 0 });
  }, [search.results.length, search.status, setFocus]);

  const openResult = (index: number) => {
    const result = search.results[index];
    if (!result) return;
    setFocus({ zone: 'results', index });
    dispatch(searchActions.resultOpened(result));
    navigate(
      result._type === 'movie'
        ? { type: 'movieDetails', mediaId: result.mediaId }
        : { type: 'showDetails', mediaId: result.mediaId },
      { parent: { type: 'search' } }
    );
  };
  const selectGenre = (index: number) => {
    const chip = SEARCH_GENRE_CHIPS[index];
    if (!chip) return;
    setFocus({ zone: 'popular', index });
    dispatch(searchActions.genreSelected(chip.key));
  };
  const selectRecent = (index: number) => {
    const entry = recents[index];
    if (!entry) return;
    setFocus({ zone: 'recents', index });
    dispatch(searchActions.recentSelected(entry.recent));
  };

  const move = (direction: SearchDirection) => {
    const next = moveSearchFocus(focus, direction, counts, search.lastKey);
    if (next) setFocus(next);
    return true;
  };

  const navigationRef = useKeyboardNavigation({
    onUp: () => move('up'),
    onDown: () => move('down'),
    onLeft: () => move('left'),
    onRight: () => move('right'),
    onConfirm: () => {
      if (focus.zone === 'keyboard') pressKey(focus.index);
      else if (focus.zone === 'popular') selectGenre(focus.index);
      else if (focus.zone === 'recents') selectRecent(focus.index);
      else if (focus.zone === 'results') openResult(focus.index);
      else if (focus.zone === 'back') onDismiss();
      else return false;
      return true;
    },
    onBack: event => {
      // A physical Backspace edits the query; remote Back leaves the page.
      if (event.key === 'Backspace' && (search.query || search.genre)) {
        deleteCharacter();
        return true;
      }
      onDismiss();
      return true;
    },
  });

  // On desktop, typing anywhere on the page goes to the search box.
  const typeIntoBox = (event: KeyboardEvent<HTMLElement>) => {
    if (IS_TV || event.defaultPrevented || event.target === inputRef.current) return;
    if (event.key.length !== 1 || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    typeText(event.key);
    setFocus({ zone: 'input', index: 0 });
  };

  const heading = search.genre
    ? `Popular in “${searchGenreLabel(search.genre)}”`
    : `Results for “${search.query.trim()}”`;
  const showResults = search.status !== 'idle' || search.results.length > 0;

  return (
    <Page ref={navigationRef} aria-label="Search" onKeyDown={typeIntoBox}>
      <SearchBox
        ref={inputRef}
        value={search.query}
        focused={focus.zone === 'input'}
        onChange={value => dispatch(searchActions.queryChanged(value))}
        onSubmit={submitFromBox}
        onFocus={() => setFocus({ zone: 'input', index: 0 })}
        onLeave={() => setFocus({ zone: 'keyboard', index: 0 })}
      />
      <Columns>
        <OnScreenKeyboard
          focusedIndex={focus.zone === 'keyboard' ? focus.index : null}
          onPress={pressKey}
          onFocusKey={index => setFocus({ zone: 'keyboard', index })}
          registerKey={register('keyboard')}
        />
        <RightColumn>
          <SearchChips
            title="Popular searches"
            items={SEARCH_GENRE_CHIPS}
            icon={<SearchIcon aria-hidden="true" />}
            columns={POPULAR_COLUMNS}
            focusedIndex={focus.zone === 'popular' ? focus.index : null}
            onSelect={selectGenre}
            onFocusChip={index => setFocus({ zone: 'popular', index })}
            registerChip={register('popular')}
          />
          {recents.length > 0 && (
            <SearchChips
              title="Recent searches"
              items={recents}
              icon={<ClockIcon aria-hidden="true" />}
              columns={MAX_RECENT_CHIPS}
              focusedIndex={focus.zone === 'recents' ? focus.index : null}
              onSelect={selectRecent}
              onFocusChip={index => setFocus({ zone: 'recents', index })}
              registerChip={register('recents')}
            />
          )}
          {showResults && (
            <SearchResults
              heading={heading}
              status={search.status}
              results={search.results}
              details={search.details}
              totalResults={search.totalResults}
              focusedIndex={focus.zone === 'results' ? focus.index : null}
              onOpen={openResult}
              onFocusResult={index => setFocus({ zone: 'results', index })}
              registerResult={register('results')}
            />
          )}
        </RightColumn>
      </Columns>
      <BackRail
        ref={backRef}
        label="Back to Home"
        onBack={onDismiss}
        onFocus={() => setFocus({ zone: 'back', index: 0 })}
      />
    </Page>
  );
};

export default SearchPage;

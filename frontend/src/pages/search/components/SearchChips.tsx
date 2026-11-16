import { FilterChip, Heading, RemovableChip } from '@shared/design-system';
import { FocusGroup } from '@shared/navigation';

import { SEARCH_NAV } from '../searchNav';
import * as styles from './searchChips.css';

import SearchIcon from '~icons/mdi/magnify';

/** Popular genres per row: the `search-popular` grid group's columns. */
export const POPULAR_COLUMNS = 5;

export interface SearchShortcut {
  key: string;
  label: string;
}

/**
 * The catalog's genres as filter chips on a grid; the browsed genre is the selected one (and where
 * the group is entered).
 */
export function PopularSearches({
  genres,
  selected,
  onSelect,
}: {
  genres: readonly SearchShortcut[];
  selected: string | null;
  onSelect: (index: number) => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="search-popular-title">
      <div className={styles.title}>
        <Heading level={2} variant="heading" id="search-popular-title">
          Popular searches
        </Heading>
      </div>
      <FocusGroup id={SEARCH_NAV.popular} layout="grid" columns={POPULAR_COLUMNS}>
        <div className={styles.chips}>
          {genres.map((genre, index) => (
            <div key={genre.key} className={styles.cell}>
              <FilterChip
                navId={SEARCH_NAV.genre(genre.key)}
                icon={<SearchIcon />}
                selected={genre.key === selected}
                // Choosing the browsed genre again browses it again; it never clears
                onSelectedChange={() => onSelect(index)}
              >
                {genre.label}
              </FilterChip>
            </div>
          ))}
        </div>
      </FocusGroup>
    </section>
  );
}

/** Recent searches in a row: the body runs one again, the circle forgets it. */
export function RecentSearches({
  recents,
  onSelect,
  onRemove,
}: {
  recents: readonly SearchShortcut[];
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="search-recents-title">
      <div className={styles.title}>
        <Heading level={2} variant="heading" id="search-recents-title">
          Recent searches
        </Heading>
      </div>
      <FocusGroup id={SEARCH_NAV.recents} layout="horizontal">
        <div className={styles.row}>
          {recents.map((recent, index) => (
            <div key={recent.key} className={styles.rowItem}>
              <RemovableChip
                navId={SEARCH_NAV.recent(recent.key)}
                removeLabel={`Remove “${recent.label}”`}
                onClick={() => onSelect(index)}
                onRemove={() => onRemove(index)}
              >
                {recent.label}
              </RemovableChip>
            </div>
          ))}
        </div>
      </FocusGroup>
    </section>
  );
}

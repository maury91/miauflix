import { FilterChip, Heading, RemovableChip } from '@shared/design-system';
import { useT } from '@shared/i18n';
import { FocusGroup } from '@shared/navigation';

import { SEARCH_NAV } from '../searchNav';
import * as styles from './searchChips.css';

import SearchIcon from '~icons/mdi/magnify';

export interface SearchShortcut {
  key: string;
  label: string;
}

/**
 * The catalog's genres as full-width filter chips, one per line; the browsed genre is the selected one (and where
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
  const t = useT();
  return (
    <section className={styles.section} aria-labelledby="search-popular-title">
      <div className={styles.title}>
        <Heading level={2} variant="heading" id="search-popular-title">
          {t('search.popular')}
        </Heading>
      </div>
      {/* One genre per line, as wide as the column */}
      <FocusGroup id={SEARCH_NAV.popular} layout="vertical">
        <div className={styles.list}>
          {genres.map((genre, index) => (
            <div key={genre.key} className={styles.cell}>
              <FilterChip
                navId={SEARCH_NAV.genre(genre.key)}
                icon={<SearchIcon />}
                fullWidth
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

/** Recent searches, wrapping: the body runs one again, the circle forgets it. */
export function RecentSearches({
  recents,
  onSelect,
  onRemove,
}: {
  recents: readonly SearchShortcut[];
  onSelect: (index: number) => void;
  onRemove: (index: number) => void;
}) {
  const t = useT();
  return (
    <section className={styles.section} aria-labelledby="search-recents-title">
      <div className={styles.title}>
        <Heading level={2} variant="heading" id="search-recents-title">
          {t('search.recent')}
        </Heading>
      </div>
      <FocusGroup id={SEARCH_NAV.recents} layout="spatial">
        <div className={styles.row}>
          {recents.map((recent, index) => (
            <div key={recent.key} className={styles.rowItem}>
              <RemovableChip
                navId={SEARCH_NAV.recent(recent.key)}
                removeLabel={t('search.remove', { label: recent.label })}
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

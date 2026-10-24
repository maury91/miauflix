/** The frontend-owned row of unfinished titles; its cards come from progress, not from a list. */
export const CONTINUE_CATEGORY = {
  name: 'Continue watching',
  slug: 'continue-watching',
  description: 'Pick up where you left off',
  url: '/continue-watching',
};

export type ContinueCategory = typeof CONTINUE_CATEGORY;

/** Home rows in display order: Continue watching first when it has cards, then the lists. */
export function composeHomeCategories<T>(
  lists: readonly T[],
  hasContinueWatching: boolean
): Array<T | ContinueCategory> {
  return hasContinueWatching ? [CONTINUE_CATEGORY, ...lists] : [...lists];
}

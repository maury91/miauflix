/**
 * Navigation ids of the Search screen (docs/plans/style-guide.md, section 10): the back rail, then
 * the search field above the keyboard and, beside it, the shortcuts and the results.
 */
export const SEARCH_NAV = {
  scope: 'search',
  rail: 'search-rail',
  back: 'search-back',
  content: 'search-content',
  field: 'search-field',
  columns: 'search-columns',
  keyboard: 'search-keyboard',
  key: (id: string) => `search-keyboard:${id}`,
  side: 'search-side',
  popular: 'search-popular',
  genre: (key: string) => `search-genre:${key}`,
  recents: 'search-recents',
  recent: (key: string) => `search-recent:${key}`,
  results: 'search-results',
  result: (key: string) => `search-result:${key}`,
  panel: 'search-panel',
  panelAction: 'search-panel:action',
  panelDetails: 'search-panel:details',
} as const;

/** Where Search starts without a remembered focus: the keyboard's first key. */
export const SEARCH_START = SEARCH_NAV.key('a');

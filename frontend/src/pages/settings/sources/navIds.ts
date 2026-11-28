/** Navigation IDs the Sources page shares with its parts. */

/** Advanced setup: its toggle (Add source focuses it) and the repositories' controls. */
export const ADVANCED_NAV = {
  toggle: 'sources-advanced',
  repositoryUrl: 'repository-url',
  repositoryAdd: 'repository-add',
  refresh: (id: string) => `repository:${id}:refresh`,
  remove: (id: string) => `repository:${id}:remove`,
} as const;

/** Navigation IDs of the indexer catalog, the Stremio form and the Torznab form. */
export const ADD_SOURCE_NAV = {
  browse: 'indexers-browse',
  search: 'indexers-search',
  source: 'indexers-source',
  filters: 'indexers-filters',
  filter: (flag: string) => `indexers-filter:${flag}`,
  check: 'indexers-check',
  results: 'indexers-results',
  add: (entry: { source: string; id: string }) => `indexer-add:${entry.source}|${entry.id}`,
  more: 'indexers-more',
  stremioUrl: 'stremio-url',
  stremioSubmit: 'stremio-submit',
  torznabName: 'torznab-name',
  torznabUrl: 'torznab-url',
  torznabKey: 'torznab-key',
  torznabSubmit: 'torznab-submit',
} as const;

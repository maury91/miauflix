/** The ways to add a source, each with a page of its own. */
export type SourceKind = 'stremio' | 'torznab' | 'catalog';

/** Navigation IDs of the sources setup. */
export const SOURCES_SETUP_NAV = {
  options: 'sources-options',
  option: (kind: SourceKind) => `sources-option:${kind}`,
  info: (kind: SourceKind) => `sources-option-info:${kind}`,
  infoBrowse: (kind: SourceKind) => `sources-option-browse:${kind}`,
  browse: 'sources-browse',
  list: 'sources-yours',
  source: (id: string) => `sources-yours:${id}`,
  retry: 'sources-retry',
} as const;

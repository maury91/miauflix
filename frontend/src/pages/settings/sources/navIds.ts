/** Navigation IDs the Sources page shares with its parts. */

/** Advanced setup: its toggle (Add source focuses it) and the repositories' controls. */
export const ADVANCED_NAV = {
  toggle: 'sources-advanced',
  repositoryUrl: 'repository-url',
  repositoryAdd: 'repository-add',
  refresh: (id: string) => `repository:${id}:refresh`,
  remove: (id: string) => `repository:${id}:remove`,
} as const;

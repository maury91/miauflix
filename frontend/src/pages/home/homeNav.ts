/**
 * Navigation IDs on Home's browse screen: a horizontal page scope holding the rail and the rows,
 * a vertical group of rows, and one carousel per row keyed by its list (never its position).
 */
export type SidebarItem = 'notifications' | 'search' | 'profile' | 'settings';

export const HOME_NAV = {
  scope: 'home',
  rail: 'home-rail',
  rows: 'home-rows',
  railItem: (item: SidebarItem) => `home-rail:${item}`,
  row: (slug: string) => `home-row:${slug}`,
} as const;

const RAIL_ITEM_PREFIX = 'home-rail:';
const ROW_PREFIX = 'home-row:';

/** The rail item a navigation ID names, or null. */
export function railItemOf(id: string | null): SidebarItem | null {
  return id?.startsWith(RAIL_ITEM_PREFIX)
    ? (id.slice(RAIL_ITEM_PREFIX.length) as SidebarItem)
    : null;
}

/** The list slug of the row a navigation ID names, or null. */
export function rowSlugOf(id: string | null): string | null {
  return id?.startsWith(ROW_PREFIX) ? id.slice(ROW_PREFIX.length) : null;
}

/** Cards per list page requested from the backend. */
export const ROW_PAGE_SIZE = 20;

/**
 * The list pages a row needs around its selection: the selection's own page, plus the next page
 * once the selection is past the middle of its page (or the previous one before the middle), so a
 * neighbouring page is ready well before the selection reaches it.
 */
export function rowPagesFor(selectedIndex: number, total: number, pageSize = ROW_PAGE_SIZE) {
  const page = Math.floor(Math.max(0, selectedIndex) / pageSize);
  const pastMiddle = selectedIndex - page * pageSize >= pageSize / 2;
  const neighbour = pastMiddle ? page + 1 : page - 1;
  return { page, neighbour: neighbour >= 0 && neighbour * pageSize < total ? neighbour : null };
}

/**
 * Cards rendered on each side of the selection. Never more than half a page, so every rendered
 * card is on the pages `rowPagesFor` loads.
 */
export function rowRenderRadius(mediaPerPage: number, pageSize = ROW_PAGE_SIZE) {
  return Math.min(pageSize / 2, mediaPerPage + 4);
}

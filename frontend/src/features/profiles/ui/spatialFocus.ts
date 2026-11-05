export type Direction = 'left' | 'right' | 'up' | 'down';

/** Elements a remote can move between carry this attribute. */
export const NAV_ATTRIBUTE = 'data-profile-nav';

/**
 * Areas laid out side by side (e.g. a preview column beside a scrolling form) carry this: Up and
 * Down stay within the area, and Left and Right leave it only when nothing is that way inside.
 */
export const NAV_REGION_ATTRIBUTE = 'data-profile-nav-region';

const regionOf = (element: HTMLElement) => element.closest(`[${NAV_REGION_ATTRIBUTE}]`);

function candidates(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(`[${NAV_ATTRIBUTE}]`)].filter(element => {
    if (element.matches(':disabled') || element.closest('[inert]')) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

/**
 * The element a D-pad direction leads to from `from`, as on TV grids:
 * - Up and Down go to the nearest row on that side within the same area, then to its item
 *   closest across (so a shorter last row is still reached).
 * - Left and Right stay in the current row; at its end they cross into the area beside (a
 *   preview column), landing on its item nearest in height.
 * Only elements whose centre is past `from`'s edge count as being on that side.
 */
export function nearestInDirection(
  container: HTMLElement,
  from: HTMLElement,
  direction: Direction
): HTMLElement | null {
  const origin = from.getBoundingClientRect();
  const vertical = direction === 'up' || direction === 'down';
  const region = regionOf(from);
  const ahead = candidates(container)
    .map((element, order) => ({ element, order }))
    .filter(({ element }) => element !== from)
    .map(({ element, order }) => {
      const rect = element.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const beyond =
        direction === 'left'
          ? x < origin.left
          : direction === 'right'
            ? x > origin.right
            : direction === 'up'
              ? y < origin.top
              : y > origin.bottom;
      // How far its near edge is from the origin's far edge (0 when they overlap).
      const gap = Math.max(
        0,
        direction === 'left'
          ? origin.left - rect.right
          : direction === 'right'
            ? rect.left - origin.right
            : direction === 'up'
              ? origin.top - rect.bottom
              : rect.top - origin.bottom
      );
      return {
        element,
        order,
        beyond,
        gap,
        // From a wide field, everything under it is straight below (the first in reading order
        // wins): the distance is to its span, not its centre.
        across: vertical
          ? distanceToSpan(x, origin.left, origin.right)
          : distanceToSpan(y, origin.top, origin.bottom),
        local: regionOf(element) === region,
        inRow: rect.bottom > origin.top && rect.top < origin.bottom,
      };
    })
    .filter(({ beyond }) => beyond);
  if (vertical)
    return nearestBand(
      ahead.filter(({ local }) => local),
      origin,
      vertical
    );
  const inRow = ahead.filter(({ local, inRow }) => local && inRow);
  return nearestBand(inRow.length ? inRow : ahead.filter(({ local }) => !local), origin, vertical);
}

const distanceToSpan = (value: number, start: number, end: number) =>
  value < start ? start - value : value > end ? value - end : 0;

/** The nearest row or column among `ahead`, then the item in it closest across. */
function nearestBand(
  ahead: { element: HTMLElement; order: number; gap: number; across: number }[],
  origin: DOMRect,
  vertical: boolean
): HTMLElement | null {
  if (!ahead.length) return null;
  // The nearest row or column: everything starting within half the origin's size of the closest.
  const nearestGap = Math.min(...ahead.map(({ gap }) => gap));
  const tolerance = (vertical ? origin.height : origin.width) / 2;
  const [best] = ahead
    .filter(({ gap }) => gap <= nearestGap + tolerance)
    // Ties go to reading order (explicitly: the 2020 TVs' sort is not stable).
    .sort((a, b) => a.across - b.across || a.gap - b.gap || a.order - b.order);
  return best.element;
}

/** Entering a tab list from outside lands on its selected tab. */
function landingTarget(from: HTMLElement, next: HTMLElement): HTMLElement {
  const tablist = next.closest('[role="tablist"]');
  if (!tablist || tablist.contains(from)) return next;
  return tablist.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]') ?? next;
}

/** The element last left in each area, to come back to it. */
const lastInRegion = new WeakMap<Element, HTMLElement>();

/**
 * Crossing into the area beside returns to where the focus left it (back on the same swatch
 * after a trip to the preview), when that element is still shown.
 */
function returnTarget(from: HTMLElement, next: HTMLElement): HTMLElement {
  const fromRegion = regionOf(from);
  const nextRegion = regionOf(next);
  if (!fromRegion || !nextRegion || fromRegion === nextRegion) return next;
  lastInRegion.set(fromRegion, from);
  const remembered = lastInRegion.get(nextRegion);
  return remembered?.isConnected && remembered.getBoundingClientRect().width > 0
    ? remembered
    : next;
}

/** Move focus within `container`; returns whether it moved. */
export function moveFocus(container: HTMLElement | null, direction: Direction): boolean {
  if (!container) return false;
  const active = document.activeElement;
  const from =
    active instanceof HTMLElement &&
    container.contains(active) &&
    active.hasAttribute(NAV_ATTRIBUTE)
      ? active
      : null;
  if (!from) return focusFirst(container);
  const nearest = nearestInDirection(container, from, direction);
  if (!nearest) return false;
  const next = returnTarget(from, landingTarget(from, nearest));
  next.focus({ preventScroll: false });
  next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  return true;
}

export function focusFirst(container: HTMLElement | null, selector?: string): boolean {
  if (!container) return false;
  const target =
    (selector ? container.querySelector<HTMLElement>(selector) : null) ?? candidates(container)[0];
  if (!target) return false;
  target.focus({ preventScroll: true });
  return true;
}

import { useSyncExternalStore } from 'react';

import { breakpoint } from '../tokens';

/** Web window size classes (Material 3), from the breakpoint tokens. TV is `large`. */
export type WindowClass = 'compact' | 'medium' | 'expanded' | 'large';

/** A value for every window class, or one per class from `compact` up; larger ones inherit. */
export type Responsive<T> = T | { compact: T; medium?: T; expanded?: T; large?: T };

export const windowClasses: readonly WindowClass[] = ['compact', 'medium', 'expanded', 'large'];

/** The media query starting each class above `compact`. */
export const windowClassQuery = {
  medium: `(min-width: ${breakpoint.medium})`,
  expanded: `(min-width: ${breakpoint.expanded})`,
  large: `(min-width: ${breakpoint.large})`,
} as const;

const isPerClass = <T>(
  value: Responsive<T>
): value is { compact: T } & Partial<Record<WindowClass, T>> =>
  typeof value === 'object' && value !== null && 'compact' in value;

/** The value in force for a window class: its own, else the nearest smaller class's. */
export function resolveResponsive<T>(value: Responsive<T>, windowClass: WindowClass): T {
  if (!isPerClass(value)) return value;
  for (let index = windowClasses.indexOf(windowClass); index > 0; index--) {
    const own = value[windowClasses[index]];
    if (own !== undefined) return own;
  }
  return value.compact;
}

/** The value for each class, as data attributes for static media rules (`data-<name>-medium`). */
export function responsiveAttributes<T extends string | number>(
  name: string,
  value: Responsive<T> | undefined
): Record<string, T | undefined> {
  if (value === undefined) return {};
  if (!isPerClass(value)) return { [`data-${name}`]: value };
  return {
    [`data-${name}`]: value.compact,
    [`data-${name}-medium`]: value.medium,
    [`data-${name}-expanded`]: value.expanded,
    [`data-${name}-large`]: value.large,
  };
}

function currentWindowClass(): WindowClass {
  if (typeof window === 'undefined' || !window.matchMedia) return 'compact';
  for (let index = windowClasses.length - 1; index > 0; index--) {
    const windowClass = windowClasses[index] as Exclude<WindowClass, 'compact'>;
    if (window.matchMedia(windowClassQuery[windowClass]).matches) return windowClass;
  }
  return 'compact';
}

function subscribe(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const lists = Object.values(windowClassQuery).map(query => window.matchMedia(query));
  lists.forEach(list => list.addEventListener('change', onChange));
  return () => lists.forEach(list => list.removeEventListener('change', onChange));
}

/**
 * The current window class, from the same media queries as the CSS: the navigation layer resolves
 * a responsive Grid's columns with it instead of measuring the layout.
 */
export function useWindowClass(): WindowClass {
  return useSyncExternalStore(subscribe, currentWindowClass, () => 'compact');
}

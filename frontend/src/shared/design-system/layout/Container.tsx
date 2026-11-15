import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import * as styles from './container.css';
import type { LayoutElement } from './Stack';

type LayoutAttributes = Omit<HTMLAttributes<HTMLElement>, 'className' | 'style' | 'children'>;

export type ContainerProps = LayoutAttributes & {
  children?: ReactNode;
  /**
   * `form` (35rem) for a single column of fields, `reading` (50rem) for text and settings pages,
   * `full` for browse screens and anything laid out across the screen.
   */
  width?: 'form' | 'reading' | 'full';
  /** `none` when something around it already keeps it off the edges (a panel, a pane). */
  gutters?: 'viewport' | 'none';
  as?: LayoutElement | 'main' | 'article';
};

/**
 * Centres content at a named width with the web's viewport gutters (`md` on compact windows, `lg`
 * from medium up). On TV it adds no gutters: the screen's SafeArea keeps content off the edges.
 * Widths are `rem`, so they scale with density like everything else.
 */
export function Container({
  children,
  width = 'full',
  gutters = 'viewport',
  as = 'div',
  ...props
}: ContainerProps) {
  return createElement(
    as,
    {
      ...props,
      className: styles.container,
      'data-width': width,
      'data-gutters': gutters === 'none' ? 'none' : undefined,
    },
    children
  );
}

export type SafeAreaProps = LayoutAttributes & {
  children?: ReactNode;
  /** The edges kept clear: `x` for a full-height column, `y` for a full-width band. */
  edges?: 'all' | 'x' | 'y';
  /** At least the screen's height, for a screen-sized region. */
  fill?: boolean;
  as?: LayoutElement | 'main' | 'article';
};

/**
 * Keeps interactive content and text inside the screen's safe area: `4rem` × `2.25rem` on TV
 * (5% of a 1080p screen), the device's insets on the web (notches, rounded corners; zero unless
 * the page's viewport meta has `viewport-fit=cover`). Put it around each screen, inside anything
 * that should bleed to the edges (artwork, scrims, backgrounds), so focus outlines keep room too.
 */
export function SafeArea({
  children,
  edges = 'all',
  fill = false,
  as = 'div',
  ...props
}: SafeAreaProps) {
  return createElement(
    as,
    {
      ...props,
      className: styles.safeArea,
      'data-edges': edges === 'all' ? undefined : edges,
      'data-fill': fill || undefined,
    },
    children
  );
}

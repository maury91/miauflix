import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import type { TypeRole } from '../tokens';
import * as styles from './text.css';

interface TypographyProps {
  /** A named role of the type scale; never a size of its own. */
  variant?: TypeRole;
  /** `secondary` for helper text (essential helper text too), `disabled` for unavailable items. */
  tone?: 'primary' | 'secondary' | 'disabled';
  /**
   * Truncation: `1` keeps one line with an ellipsis, 2 to 6 clamp to that many lines. The full
   * text stays readable by assistive technology. Unset, text wraps.
   */
  maxLines?: 1 | 2 | 3 | 4 | 5 | 6;
  /** Start by default (mirrored for right-to-left text). */
  align?: 'start' | 'center' | 'end';
  /** All text comes from the feature (i18n). */
  children: ReactNode;
}

type Attributes = Omit<HTMLAttributes<HTMLElement>, 'className' | 'style' | 'children'>;

export type TextProps = Attributes &
  TypographyProps & {
    /** The element that keeps the text's meaning. */
    as?: 'p' | 'span' | 'div' | 'strong' | 'em' | 'small' | 'label';
    /** With `as="label"`: the control it names. */
    htmlFor?: string;
  };

const attributes = ({ variant, tone, maxLines, align }: Omit<TypographyProps, 'children'>) => ({
  className: styles.text,
  'data-variant': variant,
  'data-tone': tone === 'primary' ? undefined : tone,
  'data-lines': maxLines,
  'data-align': align === 'start' ? undefined : align,
});

/**
 * Text in one of the type scale's roles. Passive: never a focus target. Features never set font
 * sizes or weights of their own.
 */
export function Text({
  as = 'p',
  variant = 'body',
  tone,
  maxLines,
  align,
  children,
  ...props
}: TextProps) {
  return createElement(
    as,
    { ...props, ...attributes({ variant, tone, maxLines, align }) },
    children
  );
}

export type HeadingProps = Attributes &
  TypographyProps & {
    /** The level in the page outline, independent of how large it looks. */
    level: 1 | 2 | 3 | 4 | 5 | 6;
  };

/** The role each level takes unless `variant` says otherwise. */
const headingRole: Record<HeadingProps['level'], TypeRole> = {
  1: 'title',
  2: 'heading',
  3: 'label',
  4: 'label',
  5: 'label',
  6: 'label',
};

/**
 * A heading: its level is the outline, `variant` the look (a level 2 heading can look like a
 * title). In sentence case, overriding the app's global uppercase headings.
 */
export function Heading({
  level,
  variant,
  tone,
  maxLines,
  align,
  children,
  ...props
}: HeadingProps) {
  return createElement(
    `h${level}`,
    {
      ...props,
      ...attributes({ variant: variant ?? headingRole[level], tone, maxLines, align }),
    },
    children
  );
}

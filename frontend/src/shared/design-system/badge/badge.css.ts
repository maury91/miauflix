import { style } from '@vanilla-extract/css';

import * as actionStyles from '../action/action.css';
import { color, fontFamily, radius, space } from '../tokens';
import { badgeLabel } from './badge.metrics';

/**
 * Badge (docs/plans/style-guide.md, sections 5 and 8.4): a passive, compact label. Every badge has
 * an opaque dark fill so it reads the same on the canvas and over artwork; a tone colours only its
 * border and text, never an action. Uppercase lives only here. States are attributes:
 *
 * - `data-kind="label" | "count"`: a short uppercase label (quality, availability) or a pill count
 * - `data-tone`: neutral, info, success, warning or danger (labels only)
 *
 * Each selector is its own rule: Chromium 69 drops a whole selector list over one it doesn't know.
 */

const tones = ['info', 'success', 'warning', 'danger'] as const;

const toneSelectors: Record<string, { color: string; borderColor: string }> = {};
for (const tone of tones) {
  toneSelectors[`&[data-tone="${tone}"]`] = { color: color[tone], borderColor: color[tone] };
}

export const badge = style({
  // Holds the visually hidden accessible label
  position: 'relative',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  verticalAlign: 'middle',
  flex: 'none',
  fontFamily,
  whiteSpace: 'nowrap',
  selectors: {
    '&[data-kind="label"]': {
      height: badgeLabel.height,
      padding: `0 ${badgeLabel.paddingX}`,
      border: `${badgeLabel.border} solid ${badgeLabel.borderColor}`,
      borderRadius: badgeLabel.radius,
      backgroundColor: badgeLabel.fill,
      color: badgeLabel.textColor,
      fontSize: badgeLabel.fontSize,
      lineHeight: 1,
      fontWeight: badgeLabel.fontWeight,
      textTransform: 'uppercase',
    },
    ...toneSelectors,
    '&[data-kind="count"]': {
      justifyContent: 'center',
      minWidth: '1.25rem',
      height: '1.25rem',
      padding: `0 ${space['2xs']}`,
      borderRadius: radius.full,
      backgroundColor: color.text,
      color: color.canvas,
      fontSize: '0.75rem',
      lineHeight: 1,
      fontWeight: 600,
    },
    // A count on a focused (white) action inverts
    [`${actionStyles.action}[data-focused] &[data-kind="count"]`]: {
      backgroundColor: color.canvas,
      color: color.text,
    },
  },
});

export const icon = style({
  display: 'inline-flex',
  marginRight: space['2xs'],
  fontSize: '1rem',
  lineHeight: 0,
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space['2xs'] },
  },
});

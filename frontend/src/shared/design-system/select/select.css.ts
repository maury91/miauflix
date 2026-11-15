import { keyframes, style } from '@vanilla-extract/css';

import { action } from '../action/action.css';
import {
  color,
  controlSize,
  controlSizes,
  duration,
  easing,
  layer,
  radius,
  shadowOverlay,
  space,
} from '../tokens';

/**
 * Select (docs/plans/style-guide.md, sections 4 and 8.2). The trigger is an inverted-fill action
 * (the `action` recipe) with a hairline border at rest on solid surfaces, so a closed select reads
 * as a control and not as text. The popup is an OptionList on a raised panel below or above the
 * trigger, placed without measuring and animated with opacity and transform only.
 */

const borderWidth = '0.0625rem';

export const root = style({
  position: 'relative',
  display: 'inline-flex',
  verticalAlign: 'middle',
  maxWidth: '100%',
  selectors: {
    '&[data-full-width]': { display: 'flex', width: '100%' },
  },
});

export const trigger = style({
  boxSizing: 'border-box',
  maxWidth: '100%',
  selectors: {
    '&[data-surface="solid"]': { border: `${borderWidth} solid ${color.borderControl}` },
    '&[data-surface="solid"][data-focused]': { borderColor: color.actionFocus },
    // The native adapter's trigger is a span: it has no `:disabled`
    '&[data-disabled]': { color: color.onActionDisabled, cursor: 'default' },
    '&[data-disabled][data-surface="solid"]': { borderColor: color.borderSubtle },
    '&[data-invalid][data-surface="solid"]': { borderColor: color.danger },
    '&[data-full-width]': { display: 'flex', width: '100%', justifyContent: 'space-between' },
  },
});

export const value = style({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  selectors: {
    '&[data-placeholder]': { color: color.textSecondary },
    [`${action}[data-focused] &[data-placeholder]`]: { color: color.onActionFocus },
  },
});

export const chevron = style({
  display: 'inline-flex',
  flex: 'none',
  lineHeight: 0,
  selectors: Object.fromEntries(
    controlSizes.flatMap(size => {
      const { icon, iconGap } = controlSize[size];
      return [
        [
          `${action}[data-size="${size}"] &`,
          { fontSize: icon, marginLeft: iconGap, marginRight: `-${space['2xs']}` },
        ],
        [
          `[dir="rtl"] ${action}[data-size="${size}"] &`,
          { marginLeft: `-${space['2xs']}`, marginRight: iconGap },
        ],
      ];
    })
  ),
});

/** The native adapter's select, invisible over the trigger: the platform owns its picker. */
export const nativeSelect = style({
  position: 'absolute',
  top: 0,
  left: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  opacity: 0,
  cursor: 'inherit',
  // Its own font size keeps iOS from zooming in on focus
  fontSize: '1rem',
});

const appear = keyframes({
  from: { opacity: 0, transform: 'translateY(-0.5rem)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});
const appearAbove = keyframes({
  from: { opacity: 0, transform: 'translateY(0.5rem)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

export const popup = style({
  position: 'absolute',
  zIndex: layer.popover,
  left: 0,
  boxSizing: 'border-box',
  minWidth: '100%',
  maxWidth: '24rem',
  maxHeight: '18rem',
  overflow: 'hidden',
  borderRadius: radius.lg,
  backgroundColor: color.surfaceRaised,
  boxShadow: shadowOverlay,
  selectors: {
    '&[data-placement="bottom"]': {
      top: '100%',
      marginTop: space.xs,
      animation: `${appear} ${duration.panel} ${easing.standard}`,
    },
    '&[data-placement="top"]': {
      bottom: '100%',
      marginBottom: space.xs,
      animation: `${appearAbove} ${duration.panel} ${easing.standard}`,
    },
    '[dir="rtl"] &': { left: 'auto', right: 0 },
  },
  '@media': {
    // As specific as the placement rules, which set the animation
    '(prefers-reduced-motion: reduce)': {
      selectors: {
        '&[data-placement="bottom"]': { animation: 'none' },
        '&[data-placement="top"]': { animation: 'none' },
      },
    },
  },
});

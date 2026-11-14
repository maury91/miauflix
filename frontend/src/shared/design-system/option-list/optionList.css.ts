import { style } from '@vanilla-extract/css';

import { color, controlSize, fontFamily, radius, space, typeScale } from '../tokens';

/**
 * OptionList (docs/plans/style-guide.md, sections 4 and 8.4): options are inverted-fill actions.
 * The active option (virtual focus inside the list) is white with black text; the chosen one has a
 * check, and on its own a translucent fill. States are attributes on each option:
 *
 * - `data-active`: the list's virtual focus
 * - `aria-selected="true"`: the chosen option
 * - `aria-disabled="true"`: skipped by movement, not selectable
 */

export const listbox = style({
  boxSizing: 'border-box',
  margin: 0,
  padding: space['2xs'],
  // Scrolls itself inside a bounded container (a popup's max height)
  maxHeight: 'inherit',
  overflowY: 'auto',
  outline: 'none',
  fontFamily,
});

export const groupLabel = style({
  padding: `${space.xs} ${space.md} ${space['2xs']}`,
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
});

export const option = style({
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  minHeight: controlSize.md.height,
  padding: `${space['2xs']} ${space.md} ${space['2xs']} ${space.xs}`,
  borderRadius: radius.md,
  color: color.onAction,
  fontSize: typeScale.label.fontSize,
  lineHeight: typeScale.label.lineHeight,
  fontWeight: typeScale.label.fontWeight,
  cursor: 'pointer',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  selectors: {
    '[dir="rtl"] &': { padding: `${space['2xs']} ${space.xs} ${space['2xs']} ${space.md}` },
    '&[aria-selected="true"]': { backgroundColor: color.actionTranslucent },
    '&[data-active]': { backgroundColor: color.actionFocus, color: color.onActionFocus },
    '&[aria-disabled="true"]': {
      backgroundColor: 'transparent',
      color: color.onActionDisabled,
      cursor: 'default',
    },
  },
});

/** The check's room is always kept, so labels line up whether chosen or not. */
export const check = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.5rem',
  marginRight: space.xs,
  fontSize: '1.25rem',
  lineHeight: 0,
  visibility: 'hidden',
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.xs },
    [`${option}[aria-selected="true"] &`]: { visibility: 'visible' },
  },
});

export const label = style({
  flex: '1 1 auto',
  minWidth: 0,
  overflowWrap: 'break-word',
});

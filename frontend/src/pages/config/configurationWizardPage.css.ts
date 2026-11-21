import { color, radius, space, typeScale } from '@shared/design-system/tokens';
import { globalStyle, style } from '@vanilla-extract/css';

/**
 * The first-run wizard's step list: a numbered marker per required service, then the optional
 * services. Passive (never a focus target): the current step is `aria-current="step"`. Done steps
 * are white with a check, the current one outlined in white, the rest secondary. Margins instead
 * of flex `gap` (Chromium 69).
 */
export const timeline = style({
  display: 'flex',
  flexWrap: 'wrap',
  margin: `0 -${space.xs}`,
  padding: 0,
  listStyle: 'none',
});

export const timelineItem = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  flex: '1 1 6rem',
  minWidth: 0,
  margin: `0 ${space.xs} ${space.xs}`,
  color: color.textSecondary,
  selectors: {
    '&[data-state="complete"], &[data-state="current"]': { color: color.text },
  },
});

export const timelineMarker = style({
  boxSizing: 'border-box',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.75rem',
  height: '1.75rem',
  border: `1px solid ${color.borderControl}`,
  borderRadius: radius.full,
  fontSize: typeScale.caption.fontSize,
  fontWeight: 600,
  selectors: {
    [`${timelineItem}[data-state="current"] &`]: {
      borderColor: color.focusOutline,
      borderWidth: 2,
    },
    [`${timelineItem}[data-state="complete"] &`]: {
      borderColor: color.actionFocus,
      backgroundColor: color.actionFocus,
      color: color.onActionFocus,
    },
  },
});

export const timelineName = style({
  maxWidth: '100%',
  marginTop: space.xs,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
});

/** Previous at the start, Next at the end. */
export const stepActions = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

/** A service's readiness and its number of settings, at the row's end. */
export const optionalMeta = style({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  whiteSpace: 'nowrap',
});

globalStyle(`${optionalMeta} > * + *`, { marginTop: space['2xs'] });

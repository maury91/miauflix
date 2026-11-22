import { color, radius, space, typeScale } from '@shared/design-system/tokens';
import { globalStyle, style } from '@vanilla-extract/css';

/**
 * The player's side sheets (subtitles, audio): a header that stays (icon, title, close), then the
 * content, which scrolls in the rest of the sheet's height.
 */

export const header = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  marginBottom: space.md,
});

/** The closed-caption mark beside the title: an outlined square, like the trigger's label. */
export const headerIcon = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2.5rem',
  height: '2.5rem',
  marginRight: space.sm,
  border: `0.125rem solid ${color.borderControl}`,
  borderRadius: radius.md,
  fontSize: '1.5rem',
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.sm },
  },
});

export const headerTitle = style({
  flex: '1 1 auto',
  minWidth: 0,
  fontSize: typeScale.heading.fontSize,
  lineHeight: typeScale.heading.lineHeight,
  fontWeight: typeScale.heading.fontWeight,
});

/** The content's room: the sheet's height less the header. */
export const body = style({
  display: 'flex',
  flex: '1 1 auto',
  flexDirection: 'column',
  minHeight: 0,
});

/** A part of the panel, with a line above every part after the first. */
export const part = style({
  paddingBottom: space.md,
  selectors: {
    '& + &': { paddingTop: space.md, borderTop: `1px solid ${color.borderSubtle}` },
  },
});

/** An icon at the start of a part's heading or a row, as wide as a radio's indicator column. */
export const lead = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.5rem',
  marginRight: space.md,
  fontSize: '1.5rem',
  color: color.text,
  selectors: {
    '[dir="rtl"] &': { marginRight: 0, marginLeft: space.md },
  },
});

export const partHeading = style({
  display: 'flex',
  alignItems: 'flex-start',
  marginBottom: space.sm,
});

export const partText = style({
  display: 'flex',
  flex: '1 1 auto',
  flexDirection: 'column',
  minWidth: 0,
});

export const partTitle = style({
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
  fontWeight: 600,
});

export const partDescription = style({
  color: color.textSecondary,
  fontSize: typeScale.caption.fontSize,
  lineHeight: typeScale.caption.lineHeight,
});

/** The hearing-impaired switch with its icon: the switch fills the rest of the row. */
export const toggleRow = style({
  display: 'flex',
  alignItems: 'flex-start',
});

export const toggle = style({
  display: 'flex',
  flex: '1 1 auto',
  flexDirection: 'column',
  minWidth: 0,
});

/** Online results, under the Online row while it is open. */
export const online = style({
  padding: `${space.sm} 0 0`,
});

globalStyle(`${online} > * + *`, { marginTop: space.sm });

/** A drill-in view's heading: Back, then the view's title. */
export const viewHeading = style({
  display: 'flex',
  alignItems: 'center',
  marginBottom: space.md,
});

export const viewTitle = style({
  flex: '1 1 auto',
  minWidth: 0,
  marginLeft: space.sm,
  fontSize: typeScale.body.fontSize,
  lineHeight: typeScale.body.lineHeight,
  fontWeight: 600,
  selectors: {
    '[dir="rtl"] &': { marginLeft: 0, marginRight: space.sm },
  },
});

export const note = style({
  marginTop: space.sm,
});

/** A language picker and its Search button, side by side. */
export const searchRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: space.sm,
});

export const searchLanguage = style({
  flex: '1 1 auto',
  minWidth: 0,
});

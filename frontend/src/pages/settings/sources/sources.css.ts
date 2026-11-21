import { breakpoint, color, radius, space } from '@shared/design-system/tokens';

const compact = `(max-width: ${breakpoint.medium})`;
import { globalStyle, style } from '@vanilla-extract/css';

/**
 * The Sources page's own parts. Spacing with margins, not flex `gap` (Chromium 69); rows use flex,
 * never grid on a button (style guide, TV).
 */

/** A block under the previous one. */
export const block = style({
  marginTop: space.xl,
});

/** "How it works": a heading and three steps, side by side where they fit. */
export const step = style({
  display: 'flex',
  alignItems: 'flex-start',
});

export const stepIcon = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  width: '2.5rem',
  height: '2.5rem',
  marginRight: space.sm,
  borderRadius: radius.md,
  backgroundColor: color.surfaceRaised,
  color: color.text,
});

export const stepText = style({
  minWidth: 0,
});
globalStyle(`${stepText} > * + *`, { marginTop: space['2xs'] });

/** The list's container: rows divided by a line. */
export const providers = style({
  margin: 0,
  padding: 0,
  listStyle: 'none',
  border: `1px solid ${color.borderSubtle}`,
  borderRadius: radius.lg,
  backgroundColor: color.surface,
});

/** Every control on the first line, beside the source's name and switch. */
export const row = style({
  display: 'flex',
  alignItems: 'flex-start',
  padding: `${space.sm} ${space.md} ${space.sm} ${space.xs}`,
  borderTop: `1px solid ${color.borderSubtle}`,
  selectors: {
    '&:first-child': { borderTop: 0 },
    '&[data-dragging]': { opacity: 0.45 },
    '&[data-drag-over]': { boxShadow: `inset 0 2px 0 ${color.focusOutline}` },
  },
  // A phone: the source's text takes the width, its actions go on their own line
  '@media': { [compact]: { flexWrap: 'wrap', paddingLeft: space.md } },
});

/** Pointer only: the remote and keyboard reorder from the row's menu. */
export const handle = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1.75rem',
  height: '2.5rem',
  marginRight: space.xs,
  color: color.textSecondary,
  fontSize: '1.375rem',
  cursor: 'grab',
  touchAction: 'none',
  // Touch can't drag: the row's menu moves it
  '@media': { [compact]: { display: 'none' } },
});

/** The switch, named by the source, with what it is and how much it is used. */
export const rowMain = style({
  flex: '1 1 0%',
  minWidth: 0,
  '@media': { [compact]: { flexBasis: '100%' } },
});

export const rowActions = style({
  display: 'flex',
  flex: 'none',
  alignItems: 'center',
  marginLeft: space.sm,
  '@media': { [compact]: { marginLeft: 'auto', marginTop: space.xs } },
});
globalStyle(`${rowActions} > * + *`, { marginLeft: space.xs });

export const badges = style({
  display: 'flex',
  flexWrap: 'wrap',
  marginTop: space['2xs'],
});
globalStyle(`${badges} > *`, { marginTop: space['2xs'], marginRight: space.xs });

export const detail = style({
  padding: `${space.md} ${space.md} ${space.lg} 3.25rem`,
  '@media': { [compact]: { paddingLeft: space.md } },
  borderTop: `1px solid ${color.borderSubtle}`,
  backgroundColor: color.canvas,
});

/** Lines of supporting text, one per fact. */
export const facts = style({});
globalStyle(`${facts} > span`, { display: 'block' });

/** The list's section header: title, count and Add source. */
export const sectionBar = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  marginBottom: space.md,
});
globalStyle(`${sectionBar} > *`, { marginRight: space.sm });
globalStyle(`${sectionBar} > :last-child`, { marginLeft: 'auto', marginRight: 0 });

export const hint = style({
  display: 'flex',
  alignItems: 'center',
  margin: `${space.sm} ${space['2xs']} 0`,
  color: color.textSecondary,
});
globalStyle(`${hint} > svg`, { flex: 'none', marginRight: space.xs });

/** Advanced setup's parts, each under a line. */
export const setupPart = style({
  paddingTop: space.lg,
  marginTop: space.lg,
  borderTop: `1px solid ${color.borderSubtle}`,
  selectors: { '&:first-child': { marginTop: 0 } },
});
globalStyle(`${setupPart} > * + *`, { marginTop: space.md });

/** The indexer results: a scrolling box, so the page around it stays reachable. */
export const results = style({
  maxHeight: '26.25rem',
  overflowY: 'auto',
  border: `1px solid ${color.borderSubtle}`,
  borderRadius: radius.md,
});

export const sentinel = style({ height: 1 });

export const filters = style({
  display: 'flex',
  flexWrap: 'wrap',
});
globalStyle(`${filters} > *`, { marginRight: space.xs, marginBottom: space.xs });

export const statusLine = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
});
globalStyle(`${statusLine} > *`, { marginRight: space.md });

export const empty = style({
  padding: space.md,
});

/** One indexer in the results: what it is and supports, then Add. */
export const entry = style({
  display: 'flex',
  alignItems: 'center',
  padding: `${space.sm} ${space.md}`,
  borderTop: `1px solid ${color.borderSubtle}`,
  overflowWrap: 'anywhere',
  selectors: { '&:first-child': { borderTop: 0 } },
});

export const entryText = style({
  flex: '1 1 0%',
  minWidth: 0,
  marginRight: space.sm,
});

export const setupFields = style({});
globalStyle(`${setupFields} > * + *`, { marginTop: space.md });

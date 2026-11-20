import { color, radius, space } from '@shared/design-system/tokens';
import { globalStyle, style, styleVariants } from '@vanilla-extract/css';

/**
 * The disk bar: one segment per kind of stored data, the free space as the track, and a mark
 * where Miauflix's limit falls. Margins instead of flex `gap` (Chromium 69).
 */
export const header = style({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  marginBottom: space.md,
});
globalStyle(`${header} > *`, { marginRight: space.md });
globalStyle(`${header} > :last-child`, { marginRight: 0 });

export const totals = style({
  display: 'flex',
  alignItems: 'baseline',
});
globalStyle(`${totals} > * + *`, { marginLeft: space.md });

/** Room above the track for the limit's label. */
export const meter = style({
  position: 'relative',
  paddingTop: '1.5rem',
});

export const track = style({
  display: 'flex',
  height: '0.875rem',
  overflow: 'hidden',
  borderRadius: radius.full,
  backgroundColor: color.control,
});

export const segment = style({
  flex: 'none',
  height: '100%',
  selectors: {
    // A hairline between neighbours, so equal colours never merge
    '& + &': { boxShadow: `inset 2px 0 0 ${color.surface}` },
  },
});

/** Categorical colours, told apart by the legend's labels as well. */
export const swatch = styleVariants({
  movie: { backgroundColor: color.brand },
  episode: { backgroundColor: color.info },
  anime: { backgroundColor: color.warning },
  unknown: { backgroundColor: color.textSecondary },
  remux: { backgroundColor: color.success },
  other: { backgroundColor: color.borderControl },
  free: { backgroundColor: color.control, boxShadow: `inset 0 0 0 1px ${color.borderControl}` },
});

/** The limit: a line across the track and its label above, from `left` (a share). */
export const limit = style({
  position: 'absolute',
  top: 0,
  bottom: '-0.25rem',
  width: 0,
  borderLeft: `2px solid ${color.text}`,
});

export const limitLabel = style({
  position: 'absolute',
  top: 0,
  whiteSpace: 'nowrap',
  color: color.text,
  fontSize: '0.75rem',
  lineHeight: '1rem',
  selectors: {
    '&[data-side="end"]': { right: space.xs },
    '&[data-side="start"]': { left: space.xs },
  },
});

export const legend = style({
  display: 'flex',
  flexWrap: 'wrap',
  margin: `${space.md} 0 0`,
  padding: 0,
  listStyle: 'none',
});
globalStyle(`${legend} > li`, {
  display: 'flex',
  alignItems: 'center',
  marginRight: space.lg,
  marginBottom: space.xs,
});

export const legendSwatch = style({
  flex: 'none',
  width: '0.75rem',
  height: '0.75rem',
  marginRight: space.xs,
  borderRadius: radius.sm,
});

export const legendValue = style({
  marginLeft: space.xs,
  color: color.text,
});

export const note = style({
  marginTop: space.xs,
});

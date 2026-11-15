import { globalStyle, style } from '@vanilla-extract/css';

import { windowClassQuery } from '../layout/windowClass';
import { color, space } from '../tokens';

/**
 * ActionGroup (docs/plans/style-guide.md, section 8.1): a row of actions, primary first, with the
 * spacing owned here. Each action has half the spacing on both sides (and the row spacing above),
 * taken back by the list's negative margins: no `gap` to convert on TV, and the same result for
 * any alignment and in right-to-left text.
 *
 * - `data-layout="row" | "column" | "auto"`: `auto` is a column on compact windows
 * - `data-align="start" | "center" | "end"` (rows)
 * - `data-wrap`: rows wrap onto more lines
 * - `data-divider`: a hairline above the group
 */

const half = `${parseFloat(space.sm) / 2}rem`;

export const group = style({
  boxSizing: 'border-box',
  minWidth: 0,
  selectors: {
    '&[data-divider]': {
      paddingTop: space.lg,
      borderTop: `0.0625rem solid ${color.borderSubtle}`,
    },
  },
});

const row = {
  flexDirection: 'row',
  alignItems: 'center',
  marginTop: `-${space.xs}`,
  marginRight: `-${half}`,
  marginLeft: `-${half}`,
} as const;
const column = {
  flexDirection: 'column',
  alignItems: 'stretch',
  marginTop: `-${space.sm}`,
  marginRight: 0,
  marginLeft: 0,
} as const;

export const list = style({
  display: 'flex',
  minWidth: 0,
  ...row,
  selectors: {
    [`${group}[data-wrap] > &`]: { flexWrap: 'wrap' },
    [`${group}[data-align="center"] > &`]: { justifyContent: 'center' },
    [`${group}[data-align="end"] > &`]: { justifyContent: 'flex-end' },
    [`${group}[data-layout="column"] > &`]: column,
    [`${group}[data-layout="auto"] > &`]: column,
  },
  '@media': {
    [windowClassQuery.medium]: {
      selectors: { [`${group}[data-layout="auto"] > &`]: row },
    },
  },
});

// The actions themselves, without wrappers (above the action recipe's own `margin: 0`)
globalStyle(`${group} > ${list} > *`, { marginTop: space.xs, marginRight: half, marginLeft: half });
globalStyle(`${group}[data-layout="column"] > ${list} > *`, {
  marginTop: space.sm,
  marginRight: 0,
  marginLeft: 0,
});
globalStyle(`${group}[data-layout="auto"] > ${list} > *`, {
  marginTop: space.sm,
  marginRight: 0,
  marginLeft: 0,
});
globalStyle(`${group}[data-layout="auto"] > ${list} > *`, {
  '@media': {
    [windowClassQuery.medium]: { marginTop: space.xs, marginRight: half, marginLeft: half },
  },
});

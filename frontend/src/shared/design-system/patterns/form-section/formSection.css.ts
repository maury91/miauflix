import { style } from '@vanilla-extract/css';

import { space } from '../../tokens';

/** FormSection (docs/plans/style-guide.md, section 8.6): fields, the form's message, actions. */

export const form = style({
  margin: 0,
  minWidth: 0,
});

export const message = style({
  marginTop: space.lg,
});

export const actions = style({
  marginTop: space.lg,
});

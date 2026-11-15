import { globalStyle, style } from '@vanilla-extract/css';

import { color, scrim } from '../../tokens';

/**
 * ProfileTile (docs/plans/style-guide.md, section 8.6): in edit mode a pencil sits over the
 * dimmed avatar, in the frame, so the tile keeps its geometry.
 */

export const edit = style({
  position: 'absolute',
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: scrim.modal,
  color: color.text,
});

globalStyle(`${edit} > svg`, { width: '35%', height: '35%' });

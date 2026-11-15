import { globalStyle, style, type StyleRule } from '@vanilla-extract/css';

import { controlSize } from '../tokens';

/**
 * Icon (docs/plans/style-guide.md, sections 5 and 8.1): a standalone icon in the control sizes'
 * icon sizes (`data-size`), or 1em to follow the text around it. It draws in the current text
 * colour and sits on the text's middle.
 */

const sizes: NonNullable<StyleRule['selectors']> = {};
for (const [name, size] of Object.entries(controlSize)) {
  sizes[`&[data-size="${name}"]`] = { width: size.icon, height: size.icon };
}

export const icon = style({
  display: 'inline-flex',
  flex: 'none',
  alignItems: 'center',
  justifyContent: 'center',
  width: '1em',
  height: '1em',
  verticalAlign: 'middle',
  color: 'inherit',
  lineHeight: 0,
  selectors: sizes,
});

globalStyle(`${icon} > svg`, { display: 'block', width: '100%', height: '100%' });
